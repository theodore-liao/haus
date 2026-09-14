import { prisma } from "./db";
import { getPlaidClient, plaidErr, SOFT_PLAID_CODES } from "./plaid";
import {
  isRetirementType,
  mapPlaidToHausType,
  retirementKindFromHaus,
} from "./account-types";
import { FIXED_USD_ID, TRANSFER_CATEGORIES } from "./constants";
import { startOfDay } from "./format";
import { matchesOwner, type OwnerFilter } from "./owners";
import { propertyDebt, vehicleDebt } from "./property";
import { enrichHoldingsQuotes } from "./quotes";
import { loadCryptoLots, lotValue } from "./crypto-lots";
import type { AccountBase, InvestmentsHoldingsGetResponse, Transaction } from "plaid";
import { plaidAccessToken } from "./token-crypto";

function asTransfer(txn: Transaction) {
  const primary = txn.personal_finance_category?.primary ?? "";
  const detailed = txn.personal_finance_category?.detailed ?? "";
  if (TRANSFER_CATEGORIES.has(primary)) return true;
  if (detailed.includes("TRANSFER") || detailed.includes("ACCOUNT_TRANSFER")) return true;
  return false;
}

function asCcPayment(txn: Transaction) {
  const detailed = txn.personal_finance_category?.detailed ?? "";
  const primary = txn.personal_finance_category?.primary ?? "";
  const blob = `${txn.name ?? ""} ${txn.merchant_name ?? ""}`.toLowerCase();
  if (detailed.includes("CREDIT_CARD_PAYMENT")) return true;
  if (primary === "LOAN_PAYMENTS" && /credit card/i.test(blob)) return true;
  if (/\bbilt\s+card\b/.test(blob)) return true;
  if (/credit card payment|cc payment/.test(blob)) return true;
  return false;
}

async function upsertAccounts(
  itemDbId: string,
  accounts: AccountBase[],
  defaultOwner: string,
) {
  for (const a of accounts) {
    const hausType = mapPlaidToHausType(a.type, a.subtype ?? null);
    const existing = await prisma.account.findUnique({
      where: { plaidAccountId: a.account_id },
    });
    const current = a.balances.current ?? a.balances.available ?? null;
    await prisma.account.upsert({
      where: { plaidAccountId: a.account_id },
      create: {
        plaidAccountId: a.account_id,
        itemId: itemDbId,
        name: a.name,
        officialName: a.official_name ?? undefined,
        mask: a.mask ?? undefined,
        type: a.type,
        subtype: a.subtype ?? undefined,
        hausType,
        owner: defaultOwner,
        isRetirement: isRetirementType(hausType),
        retirementKind: retirementKindFromHaus(hausType),
        currentBalance: current ?? undefined,
        availableBalance: a.balances.available ?? undefined,
        limitAmount: a.balances.limit ?? undefined,
        isoCurrency: a.balances.iso_currency_code ?? "USD",
        lastSyncedAt: new Date(),
      },
      update: {
        name: a.name,
        officialName: a.official_name ?? undefined,
        mask: a.mask ?? undefined,
        type: a.type,
        subtype: a.subtype ?? undefined,
        hausType,
        isRetirement: existing?.isRetirement || isRetirementType(hausType),
        retirementKind: existing?.retirementKind ?? retirementKindFromHaus(hausType),
        previousBalance: existing?.currentBalance ?? undefined,
        currentBalance: current ?? undefined,
        availableBalance: a.balances.available ?? undefined,
        limitAmount: a.balances.limit ?? undefined,
        isoCurrency: a.balances.iso_currency_code ?? "USD",
        lastSyncedAt: new Date(),
      },
    });

    if (current != null) {
      const day = startOfDay();
      await prisma.balanceSnapshot.upsert({
        where: {
          accountId_date: {
            accountId: (await prisma.account.findUniqueOrThrow({
              where: { plaidAccountId: a.account_id },
            })).id,
            date: day,
          },
        },
        create: {
          accountId: (await prisma.account.findUniqueOrThrow({
            where: { plaidAccountId: a.account_id },
          })).id,
          date: day,
          current,
          available: a.balances.available ?? undefined,
        },
        update: {
          current,
          available: a.balances.available ?? undefined,
        },
      });
    }
  }
}

async function syncTransactions(accessToken: string, itemDbId: string, cursor: string | null) {
  const plaid = getPlaidClient();
  let next = cursor ?? undefined;
  let hasMore = true;
  const accountMap = new Map(
    (
      await prisma.account.findMany({
        where: { itemId: itemDbId },
        select: { id: true, plaidAccountId: true },
      })
    ).map((a) => [a.plaidAccountId, a.id]),
  );

  while (hasMore) {
    const res = await plaid.transactionsSync({
      access_token: accessToken,
      cursor: next,
      count: 500,
    });
    const { added, modified, removed, next_cursor, has_more } = res.data;

    for (const txn of [...added, ...modified]) {
      const accountId = accountMap.get(txn.account_id);
      if (!accountId) continue;
      const existing = await prisma.txn.findUnique({
        where: { plaidTransactionId: txn.transaction_id },
      });
      const merchantKey = (txn.merchant_name || txn.name || "").toLowerCase();
      const rule = merchantKey
        ? await prisma.merchantRule.findUnique({ where: { merchantKey } })
        : null;
      const data = {
        accountId,
        date: new Date(txn.date),
        authorizedDate: txn.authorized_date ? new Date(txn.authorized_date) : null,
        name: txn.name,
        merchantName: txn.merchant_name ?? null,
        amount: txn.amount,
        pending: txn.pending,
        categoryPrimary: txn.personal_finance_category?.primary ?? null,
        categoryDetailed: txn.personal_finance_category?.detailed ?? null,
        userCategory: existing?.userCategory ?? rule?.category ?? null,
        userMerchant: existing?.userMerchant ?? rule?.displayName ?? null,
        isoCurrency: txn.iso_currency_code ?? "USD",
        isTransfer: asTransfer(txn),
        isCcPayment: asCcPayment(txn),
      };
      await prisma.txn.upsert({
        where: { plaidTransactionId: txn.transaction_id },
        create: { plaidTransactionId: txn.transaction_id, ...data },
        update: data,
      });
    }

    for (const r of removed) {
      await prisma.txn.deleteMany({ where: { plaidTransactionId: r.transaction_id } });
    }

    next = next_cursor;
    hasMore = has_more;
  }

  await prisma.plaidItem.update({
    where: { id: itemDbId },
    data: { transactionsCursor: next ?? null },
  });
}

async function upsertSecurity(s: {
  security_id: string;
  ticker_symbol?: string | null;
  name?: string | null;
  type?: string | null;
  close_price?: number | null;
  close_price_as_of?: string | null;
}) {
  return prisma.security.upsert({
    where: { plaidSecurityId: s.security_id },
    create: {
      plaidSecurityId: s.security_id,
      symbol: s.ticker_symbol ?? undefined,
      name: s.name ?? s.ticker_symbol ?? "Unknown",
      type: s.type ?? undefined,
      closePrice: s.close_price ?? undefined,
      closePriceAsOf: s.close_price_as_of ? new Date(s.close_price_as_of) : undefined,
    },
    update: {
      symbol: s.ticker_symbol ?? undefined,
      name: s.name ?? s.ticker_symbol ?? "Unknown",
      type: s.type ?? undefined,
      closePrice: s.close_price ?? undefined,
      closePriceAsOf: s.close_price_as_of ? new Date(s.close_price_as_of) : undefined,
    },
  });
}

async function syncInvestments(accessToken: string, itemDbId: string) {
  const plaid = getPlaidClient();
  const accountMap = new Map(
    (
      await prisma.account.findMany({
        where: { itemId: itemDbId },
        select: { id: true, plaidAccountId: true },
      })
    ).map((a) => [a.plaidAccountId, a.id]),
  );

  let holdingsRes: InvestmentsHoldingsGetResponse | null = null;
  try {
    holdingsRes = (await plaid.investmentsHoldingsGet({ access_token: accessToken })).data;
  } catch (e) {
    const err = plaidErr(e);
    if (SOFT_PLAID_CODES.has(err.code)) return null;
    throw e;
  }

  for (const s of holdingsRes.securities ?? []) {
    await upsertSecurity(s);
  }

  const seen = new Set<string>();
  for (const h of holdingsRes.holdings ?? []) {
    const accountId = accountMap.get(h.account_id);
    if (!accountId) continue;
    const sec = h.security_id
      ? await prisma.security.findUnique({ where: { plaidSecurityId: h.security_id } })
      : null;
    const sourceKey = `${accountId}:${h.security_id || "none"}:${sec?.symbol || ""}:${sec?.name || h.security_id}`;
    seen.add(sourceKey);
    await prisma.holding.upsert({
      where: { sourceKey },
      create: {
        sourceKey,
        accountId,
        securityId: sec?.id,
        symbol: sec?.symbol,
        name: sec?.name ?? "Holding",
        type: sec?.type,
        quantity: h.quantity,
        costBasis: h.cost_basis ?? undefined,
        institutionValue: h.institution_value ?? undefined,
        institutionPrice: h.institution_price ?? undefined,
      },
      update: {
        securityId: sec?.id,
        symbol: sec?.symbol,
        name: sec?.name ?? "Holding",
        type: sec?.type,
        quantity: h.quantity,
        costBasis: h.cost_basis ?? undefined,
        institutionValue: h.institution_value ?? undefined,
        institutionPrice: h.institution_price ?? undefined,
      },
    });
  }

  const existing = await prisma.holding.findMany({
    where: { account: { itemId: itemDbId } },
    select: { id: true, sourceKey: true },
  });
  const stale = existing.filter((h) => !seen.has(h.sourceKey)).map((h) => h.id);
  if (stale.length) await prisma.holding.deleteMany({ where: { id: { in: stale } } });

  const startDate = "2015-01-01";
  const endDate = new Date().toISOString().slice(0, 10);
  let offset = 0;
  const count = 500;
  let total = Infinity;
  try {
    while (offset < total) {
      const res = await plaid.investmentsTransactionsGet({
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: { count, offset },
      });
      total = res.data.total_investment_transactions;
      for (const s of res.data.securities ?? []) {
        await upsertSecurity(s);
      }
      for (const t of res.data.investment_transactions ?? []) {
        const accountId = accountMap.get(t.account_id);
        if (!accountId) continue;
        const sec = t.security_id
          ? await prisma.security.findUnique({ where: { plaidSecurityId: t.security_id } })
          : null;
        await prisma.investmentTxn.upsert({
          where: { plaidInvestmentTxnId: t.investment_transaction_id },
          create: {
            plaidInvestmentTxnId: t.investment_transaction_id,
            accountId,
            securityId: sec?.id,
            date: new Date(t.date),
            name: t.name,
            type: t.type,
            subtype: t.subtype ?? undefined,
            quantity: t.quantity ?? undefined,
            amount: t.amount,
            price: t.price ?? undefined,
            fees: t.fees ?? undefined,
            isoCurrency: t.iso_currency_code ?? "USD",
          },
          update: {
            accountId,
            securityId: sec?.id,
            date: new Date(t.date),
            name: t.name,
            type: t.type,
            subtype: t.subtype ?? undefined,
            quantity: t.quantity ?? undefined,
            amount: t.amount,
            price: t.price ?? undefined,
            fees: t.fees ?? undefined,
          },
        });
      }
      offset += count;
    }
  } catch (e) {
    const err = plaidErr(e);
    if (SOFT_PLAID_CODES.has(err.code)) return null;
    throw e;
  }
  return null;
}

async function syncLiabilities(accessToken: string, itemDbId: string) {
  const plaid = getPlaidClient();
  try {
    const res = await plaid.liabilitiesGet({ access_token: accessToken });
    const liab = res.data.liabilities;
    if (!liab) return null;
    const byPlaid = new Map(
      (
        await prisma.account.findMany({
          where: { itemId: itemDbId },
          select: { id: true, plaidAccountId: true },
        })
      ).map((a) => [a.plaidAccountId, a.id]),
    );

    for (const c of liab.credit ?? []) {
      const id = byPlaid.get(c.account_id ?? "");
      if (!id) continue;
      await prisma.account.update({
        where: { id },
        data: {
          interestRate: c.aprs?.[0]?.apr_percentage ?? undefined,
          limitAmount: c.is_overdue == null ? undefined : undefined,
          liabilityJson: JSON.stringify(c),
        },
      });
    }
    for (const m of liab.mortgage ?? []) {
      const id = byPlaid.get(m.account_id ?? "");
      if (!id) continue;
      await prisma.account.update({
        where: { id },
        data: {
          interestRate: m.interest_rate?.percentage ?? undefined,
          liabilityJson: JSON.stringify(m),
        },
      });
    }
    for (const s of liab.student ?? []) {
      const id = byPlaid.get(s.account_id ?? "");
      if (!id) continue;
      await prisma.account.update({
        where: { id },
        data: {
          interestRate: s.interest_rate_percentage ?? undefined,
          liabilityJson: JSON.stringify(s),
        },
      });
    }
    return null;
  } catch (e) {
    const err = plaidErr(e);
    if (SOFT_PLAID_CODES.has(err.code)) return null;
    throw e;
  }
}

export async function snapshotNetWorth() {
  const accounts = await prisma.account.findMany();
  const properties = await prisma.property.findMany();
  const vehicles = await prisma.vehicle.findMany();
  const manuals = await prisma.manualAccount.findMany();
  const cryptos = await loadCryptoLots();
  const stockManualsAll = await prisma.manualHolding.findMany({ where: { kind: "security" } });
  const day = startOfDay();
  const filters: OwnerFilter[] = ["all", "a", "b", "children"];

  for (const filter of filters) {
    const accs = accounts.filter((a) => matchesOwner(a.owner, filter));
    const props = properties.filter((p) => matchesOwner(p.owner, filter));
    const vehs = vehicles.filter((v) => matchesOwner(v.owner, filter));
    const mans = manuals.filter((m) => matchesOwner(m.owner, filter));

    let cash = 0;
    let investments = 0;
    let liabilities = 0;
    let otherAssets = 0;
    for (const a of accs) {
      const bal = a.currentBalance ?? 0;
      const plaidType = (a.type || "").toLowerCase();
      const asLiability =
        ["credit_card", "mortgage", "installment", "other_liability"].includes(a.hausType) ||
        plaidType === "credit" ||
        plaidType === "loan";
      if (
        (a.hausType === "checking" || a.hausType === "savings" || a.hausType === "cash_management") &&
        !asLiability
      ) {
        cash += bal;
      } else if (asLiability) {
        liabilities += Math.abs(bal);
      } else if (
        ["brokerage", "robo", "ira", "roth", "401k", "403b", "hsa", "529", "custodial", "trump"].includes(a.hausType)
      ) {
        investments += bal;
      } else {
        otherAssets += bal;
      }
    }
    for (const m of mans) {
      if (["529", "custodial", "trump", "hsa", "ira", "roth", "401k", "403b"].includes(m.hausType)) {
        investments += m.balance;
      } else otherAssets += m.balance;
    }
    const coins = cryptos.filter((c) => matchesOwner(c.owner, filter));
    for (const c of coins) {
      investments += lotValue(c);
    }
    for (const h of stockManualsAll.filter((row) => matchesOwner(row.owner, filter))) {
      investments += h.coingeckoId === FIXED_USD_ID ? (h.quotePrice ?? 0) : (h.quotePrice ?? 0) * h.quantity;
    }
    const realEstate = props.reduce((s, p) => s + p.estimate, 0);
    const vehicleTotal = vehs.reduce((s, v) => s + v.estimate, 0);
    for (const p of props) {
      if (!p.mortgageAccountId) liabilities += propertyDebt(p, accs);
    }
    for (const v of vehs) {
      if (!v.loanAccountId) liabilities += vehicleDebt(v, accs);
    }
    const netWorth = cash + investments + realEstate + vehicleTotal + otherAssets - liabilities;

    await prisma.netWorthSnapshot.upsert({
      where: { date_ownerKey: { date: day, ownerKey: filter } },
      create: {
        date: day,
        ownerKey: filter,
        cash,
        investments,
        realEstate,
        vehicles: vehicleTotal,
        otherAssets,
        liabilities,
        netWorth,
      },
      update: {
        cash,
        investments,
        realEstate,
        vehicles: vehicleTotal,
        otherAssets,
        liabilities,
        netWorth,
      },
    });
  }
}

export async function syncPlaidItem(itemDbId: string) {
  const item = await prisma.plaidItem.findUnique({ where: { id: itemDbId } });
  if (!item) throw new Error("Item not found");
  let accessToken: string;
  try {
    accessToken = plaidAccessToken(item);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cannot decrypt Plaid token.";
    await prisma.plaidItem.update({
      where: { id: item.id },
      data: { status: "error", errorCode: "TOKEN_DECRYPT_FAILED", errorMessage: message },
    });
    return { status: "error", errors: [message] };
  }
  const plaid = getPlaidClient();
  const errors: string[] = [];
  let status = "good";
  let errorCode: string | null = null;

  try {
    const accountsRes = await plaid.accountsGet({ access_token: accessToken });
    await upsertAccounts(item.id, accountsRes.data.accounts, item.defaultOwner);
    if (!item.institutionName && accountsRes.data.item.institution_id) {
      try {
        const inst = await plaid.institutionsGetById({
          institution_id: accountsRes.data.item.institution_id,
          country_codes: ["US"] as never,
        });
        await prisma.plaidItem.update({
          where: { id: item.id },
          data: {
            institutionId: inst.data.institution.institution_id,
            institutionName: inst.data.institution.name,
          },
        });
      } catch {
        /* institution lookup is optional */
      }
    }
  } catch (e) {
    const err = plaidErr(e);
    errorCode = err.code;
    errors.push(`Accounts: ${err.message}`);
    if (err.code === "ITEM_LOGIN_REQUIRED") status = "relink";
    else status = "error";
  }

  try {
    await syncTransactions(accessToken, item.id, item.transactionsCursor);
  } catch (e) {
    const err = plaidErr(e);
    if (SOFT_PLAID_CODES.has(err.code)) {
      /* brokerage-only items often have no transactions product */
    } else if (err.code === "ITEM_LOGIN_REQUIRED") {
      status = "relink";
      errorCode = err.code;
      errors.push(`Transactions: ${err.message}`);
    } else {
      errors.push(`Transactions: ${err.message}`);
    }
  }

  try {
    const msg = await syncInvestments(accessToken, item.id);
    if (msg) errors.push(`Investments (partial): ${msg}`);
  } catch (e) {
    const err = plaidErr(e);
    if (err.code === "ITEM_LOGIN_REQUIRED") {
      status = "relink";
      errorCode = err.code;
    }
    errors.push(`Investments: ${err.message}`);
  }

  try {
    const msg = await syncLiabilities(accessToken, item.id);
    if (msg) errors.push(`Liabilities (partial): ${msg}`);
  } catch (e) {
    const err = plaidErr(e);
    errors.push(`Liabilities: ${err.message}`);
  }

  await prisma.plaidItem.update({
    where: { id: item.id },
    data: {
      lastSyncedAt: new Date(),
      status: status === "good" && errors.length ? "error" : status,
      errorCode,
      errorMessage: errors.length ? errors.join(" · ") : null,
    },
  });

  await snapshotNetWorth();
  return { status, errors };
}

export async function syncAllItems() {
  const items = await prisma.plaidItem.findMany();
  const results = [];
  for (const item of items) {
    try {
      const r = await syncPlaidItem(item.id);
      results.push({ id: item.id, ...r });
    } catch (e) {
      const err = plaidErr(e);
      await prisma.plaidItem.update({
        where: { id: item.id },
        data: {
          status: err.code === "ITEM_LOGIN_REQUIRED" ? "relink" : "error",
          errorCode: err.code,
          errorMessage: err.message,
        },
      });
      results.push({ id: item.id, status: "error", errors: [err.message] });
    }
  }
  try {
    await enrichHoldingsQuotes();
  } catch {
    /* quotes are optional */
  }
  await snapshotNetWorth();
  return results;
}
