import { prisma, ensureHousehold } from "./db";
import { matchesOwner, ownerLabel, type OwnerFilter } from "./owners";
import {
  allocationBucket,
  isCashType,
  isChildAccountType,
  isCryptoHoldingType,
  isInvestmentType,
  isLiabilityType,
  isRetirementAccount,
  isRetirementType,
} from "./account-types";
import { CONCENTRATION_FLAG, FIXED_USD_ID, HIGH_UTILIZATION, INSURANCE_RENEWAL_DAYS, IRS_LIMITS, IRS_LIMITS_YEAR, STALE_CONNECTION_HOURS, categoryLabel, incomeSourceLabel } from "./constants";
import { effectiveCategory, isCreditCardPayment, isInternalMove, isInvestFunding, recurringMerchantKey, txnMerchantKey } from "./categories";
import { dayKey, ymKey } from "./range";

async function hiddenMerchantKeys() {
  try {
    const rows = await prisma.merchantRule.findMany({ where: { hidden: true }, select: { merchantKey: true } });
    return new Set(rows.map((r) => r.merchantKey));
  } catch {
    return new Set<string>();
  }
}

async function ignoredRecurringKeys() {
  try {
    const rows = await prisma.merchantRule.findMany({
      where: { ignoreRecurring: true },
      select: { merchantKey: true },
    });
    return new Set(rows.map((r) => r.merchantKey));
  } catch {
    return new Set<string>();
  }
}

function notHidden<T extends { userMerchant?: string | null; merchantName?: string | null; name?: string | null }>(
  rows: T[],
  hidden: Set<string>,
) {
  if (!hidden.size) return rows;
  return rows.filter((t) => !hidden.has(txnMerchantKey(t)));
}
import { parseJson } from "./utils";
import { formatHoldingClass, startOfDay } from "./format";
import { differenceInCalendarDays, subDays } from "date-fns";
import { accountLabel } from "./account-label";
import { reconstructNetWorthPath } from "./history";
import { historyAgreesWithSpot, loadPriceMap, priceOnOrBefore } from "./quotes";
import { propertyDebt, vehicleDebt } from "./property";
import { loadCryptoLots, lotValue } from "./crypto-lots";
import type { BrandKind } from "./logos";

export async function getNames() {
  const household = await ensureHousehold();
  const children = await prisma.child.findMany({ orderBy: { name: "asc" } });
  return {
    nameA: household.nameA,
    nameB: household.nameB,
    quoteApiKey: household.quoteApiKey,
    children,
  };
}

export async function getConnectionCount() {
  return prisma.plaidItem.count();
}

export async function hasAnyLedger() {
  const counts = await Promise.all([
    prisma.plaidItem.count(),
    prisma.property.count(),
    prisma.vehicle.count(),
    prisma.insurancePolicy.count(),
    prisma.manualAccount.count(),
    prisma.manualHolding.count(),
    prisma.cryptoWallet.count(),
  ]);
  return counts.reduce((s, n) => s + n, 0) > 0;
}

function holdingValue(h: {
  quantity: number;
  quotePrice: number | null;
  institutionValue: number | null;
  institutionPrice: number | null;
}) {
  if (h.quotePrice != null) return h.quantity * h.quotePrice;
  if (h.institutionValue != null) return h.institutionValue;
  if (h.institutionPrice != null) return h.quantity * h.institutionPrice;
  return 0;
}

function holdingPrice(h: {
  quotePrice: number | null;
  institutionPrice: number | null;
}) {
  return h.quotePrice ?? h.institutionPrice ?? null;
}

function consolidateBySymbol<
  T extends {
    id: string;
    symbol: string | null;
    name: string;
    class: string | null;
    account: string;
    institution: string | null;
    owner: string;
    ownerLabel: string;
    taxable: boolean;
    qty: number;
    last: number | null;
    value: number;
    costBasis: number | null;
    dayPl: number | null;
    totalPl: number | null;
    dayPct: number | null;
    manual: boolean;
    accounts?: string[];
  },
>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  const leftover: T[] = [];
  for (const r of rows) {
    const sym = r.symbol?.trim().toUpperCase();
    if (!sym) {
      leftover.push(r);
      continue;
    }
    const list = groups.get(sym) ?? [];
    list.push(r);
    groups.set(sym, list);
  }
  const out: T[] = [...leftover];
  for (const [, list] of groups) {
    if (list.length === 1) {
      out.push({ ...list[0], accounts: list[0].accounts ?? [list[0].account] });
      continue;
    }
    const qty = list.reduce((s, r) => s + r.qty, 0);
    const value = list.reduce((s, r) => s + r.value, 0);
    const costOk = list.every((r) => r.costBasis != null);
    const costBasis = costOk ? list.reduce((s, r) => s + (r.costBasis ?? 0), 0) : null;
    const dayPl = list.some((r) => r.dayPl != null) ? list.reduce((s, r) => s + (r.dayPl ?? 0), 0) : null;
    const totalPl = costBasis != null ? value - costBasis : list.every((r) => r.totalPl != null) ? list.reduce((s, r) => s + (r.totalPl ?? 0), 0) : null;
    const last = qty > 0 && value ? value / qty : (list.find((r) => r.last != null)?.last ?? null);
    const dayPct =
      value !== 0 && list.some((r) => r.dayPct != null)
        ? list.reduce((s, r) => s + (r.dayPct ?? 0) * r.value, 0) / value
        : (list.find((r) => r.dayPct != null)?.dayPct ?? null);
    const accounts = [...new Set(list.map((r) => r.account))];
    const institutions = [...new Set(list.map((r) => r.institution).filter((x): x is string => Boolean(x)))];
    const owners = [...new Set(list.map((r) => r.ownerLabel))];
    const named = [...list].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
    out.push({
      ...named,
      id: `lot:${(named.symbol ?? named.id).toUpperCase()}`,
      name: named.name,
      account:
        accounts.length === 1
          ? accounts[0]
          : institutions.length === 1
            ? `${institutions[0]} · ${accounts.length} accounts`
            : `${accounts.length} accounts`,
      institution: institutions.length === 1 ? institutions[0] : null,
      ownerLabel: owners.length === 1 ? owners[0] : owners.join(" · "),
      taxable: list.some((r) => r.taxable),
      qty,
      last,
      value,
      costBasis,
      dayPl,
      totalPl,
      dayPct,
      manual: list.every((r) => r.manual),
      accounts,
    });
  }
  return out;
}

function lastPointOnOrBefore(path: { date: string; netWorth: number }[], when: Date) {
  let found: { date: string; netWorth: number } | null = null;
  for (const p of path) {
    if (new Date(p.date) <= when) found = p;
  }
  return found;
}

function changeFromPath(path: { date: string; netWorth: number }[], current: number, daysAgo: number) {
  if (path.length < 2) return null;
  const target = startOfDay();
  target.setDate(target.getDate() - daysAgo);
  const base = lastPointOnOrBefore(path, target);
  if (!base) return null;
  const age = differenceInCalendarDays(startOfDay(), startOfDay(new Date(base.date)));
  // Exact 24h / 7d / 30d windows: the baseline must be at least N days old and not much older.
  const slack = daysAgo <= 1 ? 2 : daysAgo <= 7 ? 2 : 3;
  if (age < daysAgo) return null;
  if (age > daysAgo + slack) return null;
  return current - base.netWorth;
}

export async function getOverview(filter: OwnerFilter) {
  const names = await getNames();
  const [accounts, properties, vehicles, policies, manuals, items, snapshots, holdings, recentTxnsRaw, cryptos, hidden, stockManuals] =
    await Promise.all([
      prisma.account.findMany({ include: { item: true } }),
      prisma.property.findMany(),
      prisma.vehicle.findMany(),
      prisma.insurancePolicy.findMany({ include: { documents: true } }),
      prisma.manualAccount.findMany(),
      prisma.plaidItem.findMany(),
      prisma.netWorthSnapshot.findMany({
        where: { ownerKey: filter },
        orderBy: { date: "asc" },
      }),
      prisma.holding.findMany({ include: { account: { include: { item: true } } } }),
      prisma.txn.findMany({
        include: { account: { include: { item: true } } },
        orderBy: { date: "desc" },
        take: 400,
      }),
      loadCryptoLots(),
      hiddenMerchantKeys(),
      prisma.manualHolding.findMany({ where: { kind: "security" } }),
    ]);

  const accs = accounts.filter((a) => matchesOwner(a.owner, filter));
  const props = properties.filter((p) => matchesOwner(p.owner, filter));
  const vehs = vehicles.filter((v) => matchesOwner(v.owner, filter));
  const pols = policies.filter((p) => matchesOwner(p.owner, filter));
  const mans = manuals.filter((m) => matchesOwner(m.owner, filter));
  const coins = cryptos.filter((c) => matchesOwner(c.owner, filter));
  const holds = holdings.filter((h) => matchesOwner(h.account.owner, filter));
  const recentTxns = notHidden(recentTxnsRaw, hidden);
  const txns = recentTxns.filter((t) => matchesOwner(t.account.owner, filter));

  let cash = 0;
  let investments = 0;
  let liabilities = 0;
  let otherAssets = 0;
  const allocation = {
    cash: 0,
    stocks: 0,
    crypto: 0,
    retirement: 0,
    real_estate: 0,
    vehicles: 0,
    child_accounts: 0,
    other: 0,
  };
  const allocationItems: Record<
    string,
    { label: string; value: number; symbol?: string | null; name?: string | null; kind?: "merchant" | "institution" | "security" | "crypto" }[]
  > = {
    cash: [],
    stocks: [],
    crypto: [],
    retirement: [],
    real_estate: [],
    vehicles: [],
    child_accounts: [],
    other: [],
  };

  for (const a of accs) {
    const bal = a.currentBalance ?? 0;
    const label = accountLabel(a.name, a.item.institutionName);
    const plaidType = (a.type || "").toLowerCase();
    const asLiability =
      isLiabilityType(a.hausType) || plaidType === "credit" || plaidType === "loan";
    if (isCashType(a.hausType) && !asLiability) {
      cash += bal;
      allocation.cash += bal;
      if (Math.abs(bal) >= 10) allocationItems.cash.push({ label, value: bal, name: label, kind: "institution" });
    } else if (asLiability) {
      liabilities += Math.abs(bal);
    } else if (isInvestmentType(a.hausType)) {
      investments += bal;
      const bucket = allocationBucket(a.hausType);
      allocation[bucket] += bal;
      if (Math.abs(bal) >= 10) allocationItems[bucket].push({ label, value: bal, name: label, kind: "institution" });
    } else {
      otherAssets += bal;
      allocation.other += bal;
      if (Math.abs(bal) >= 10) allocationItems.other.push({ label, value: bal, name: label, kind: "institution" });
    }
  }
  for (const m of mans) {
    investments += m.balance;
    const bucket = allocationBucket(m.hausType);
    allocation[bucket] += m.balance;
    if (Math.abs(m.balance) >= 10) {
      allocationItems[bucket].push({ label: m.name, value: m.balance, name: m.name, kind: "institution" });
    }
  }
  for (const c of coins) {
    const val = lotValue(c);
    investments += val;
    allocation.crypto += val;
    if (val >= 10) {
      allocationItems.crypto.push({ label: `${c.symbol} · ${c.name}`, value: val, symbol: c.symbol, name: c.name, kind: "crypto" });
    }
  }
  for (const h of stockManuals.filter((row) => matchesOwner(row.owner, filter))) {
    const val = h.coingeckoId === FIXED_USD_ID ? (h.quotePrice ?? 0) : (h.quotePrice ?? 0) * h.quantity;
    investments += val;
    allocation.stocks += val;
    if (Math.abs(val) >= 10) {
      allocationItems.stocks.push({
        label: h.coingeckoId === FIXED_USD_ID ? h.name : `${h.symbol} · ${h.name}`,
        value: val,
        symbol: h.coingeckoId === FIXED_USD_ID ? null : h.symbol,
        name: h.name,
        kind: "security",
      });
    }
  }
  for (const h of holds) {
    if (!isCryptoHoldingType(h.type) || isRetirementAccount(h.account)) continue;
    const val = holdingValue(h);
    if (Math.abs(val) < 0.01) continue;
    const bucket = allocationBucket(h.account.hausType);
    if (bucket === "crypto") continue;
    allocation[bucket] -= val;
    allocation.crypto += val;
    const label = accountLabel(h.account.name, h.account.item.institutionName);
    const list = allocationItems[bucket];
    const row = list.find((i) => i.label === label);
    if (row) {
      row.value -= val;
      if (Math.abs(row.value) < 10) {
        const idx = list.indexOf(row);
        if (idx >= 0) list.splice(idx, 1);
      }
    }
    if (val >= 10) {
      allocationItems.crypto.push({
        label: h.symbol ? `${h.symbol} · ${h.name}` : h.name,
        value: val,
        symbol: h.symbol,
        name: h.name,
        kind: "crypto",
      });
    }
  }
  const realEstate = props.reduce((s, p) => s + p.estimate, 0);
  const vehicleTotal = vehs.reduce((s, v) => s + v.estimate, 0);
  otherAssets += vehicleTotal;

  let reEquity = 0;
  let manualMortgages = 0;
  for (const p of props) {
    const loan = propertyDebt(p, accs);
    const equity = p.estimate - loan;
    reEquity += equity;
    allocation.real_estate += equity;
    if (Math.abs(equity) >= 10) {
      allocationItems.real_estate.push({ label: p.label, value: equity, name: p.label, kind: "institution" });
    }
    if (!p.mortgageAccountId) manualMortgages += loan;
  }
  liabilities += manualMortgages;

  for (const v of vehs) {
    const loan = vehicleDebt(v, accs);
    const equity = v.estimate - loan;
    allocation.vehicles += equity;
    if (Math.abs(equity) >= 10) {
      allocationItems.vehicles.push({ label: v.label, value: equity, name: v.label, kind: "institution" });
    }
    if (!v.loanAccountId) liabilities += loan;
  }

  const netWorth = cash + investments + realEstate + otherAssets - liabilities;

  const holdingDayPl =
    holds.reduce((s, h) => (h.quoteChange != null ? s + h.quoteChange * h.quantity : s), 0) +
    coins.reduce((s, c) => (c.quoteChange != null ? s + c.quoteChange * c.quantity : s), 0);
  const hasQuoteMove = holds.some((h) => h.quoteChange != null) || coins.some((c) => c.quoteChange != null);

  const now = new Date();
  const historyFrom = subDays(now, 42);

  const valuedHolds = holds
    .map((h) => ({ h, value: holdingValue(h), last: holdingPrice(h) }))
    .filter((x) => Math.abs(x.value) >= 10 && x.h.symbol);
  const valuedCoins = coins
    .map((c) => ({ c, value: lotValue(c), last: c.quotePrice }))
    .filter((x) => x.value >= 10 && x.c.symbol);
  const historyNeed = [...valuedHolds, ...valuedCoins]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .map((x) =>
      "h" in x
        ? {
            symbol: x.h.symbol!.trim().toUpperCase(),
            coingeckoId: null as string | null,
            spot: x.last,
            kind: (x.h.type === "cryptocurrency" ? "crypto" : "equity") as "crypto" | "equity",
          }
        : {
            symbol: x.c.symbol.trim().toUpperCase(),
            coingeckoId: x.c.coingeckoId,
            spot: x.last,
            kind: "crypto" as const,
          },
    );
  let path: { date: string; netWorth: number }[] = snapshots.map((s) => ({
    date: s.date.toISOString(),
    netWorth: s.netWorth,
  }));
  try {
    const reconstructed = await reconstructNetWorthPath(filter);
    if (reconstructed.length >= 2) path = reconstructed;
  } catch {
    /* keep stored snapshots */
  }

  const moverSymbols = [...new Set(historyNeed.map((s) => s.symbol))];
  const priceMap = moverSymbols.length
    ? await loadPriceMap(moverSymbols, historyFrom, now)
    : new Map<string, number>();

  function periodMove(symbol: string | null, qty: number, last: number | null, days: number) {
    if (!symbol || last == null || last <= 0 || qty === 0) return { delta: null as number | null, pct: null as number | null };
    const key = symbol.toUpperCase();
    const recent = priceOnOrBefore(priceMap, key, now, 3);
    if (!historyAgreesWithSpot(recent, last)) return { delta: null, pct: null };
    const then = priceOnOrBefore(priceMap, key, subDays(now, days), 10);
    if (then == null || then <= 0) return { delta: null, pct: null };
    const delta = (last - then) * qty;
    const pct = ((last - then) / then) * 100;
    return { delta, pct };
  }

  const movers = [
    ...valuedHolds.map(({ h, value, last }) => {
      const hist1 = periodMove(h.symbol, h.quantity, last, 1);
      const dayDelta = h.quoteChange != null ? h.quoteChange * h.quantity : hist1.delta;
      const dayPct = h.quoteChangePct ?? hist1.pct;
      return {
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        kind: (h.type === "cryptocurrency" ? "crypto" : "security") as "crypto" | "security",
        value,
        day: { delta: dayDelta, pct: dayPct },
        week: periodMove(h.symbol, h.quantity, last, 7),
        month: periodMove(h.symbol, h.quantity, last, 30),
      };
    }),
    ...valuedCoins.map(({ c, value, last }) => {
      const hist1 = periodMove(c.symbol, c.quantity, last, 1);
      const dayDelta = c.quoteChange != null ? c.quoteChange * c.quantity : hist1.delta;
      const dayPct = c.quoteChangePct ?? hist1.pct;
      return {
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        kind: "crypto" as const,
        value,
        day: { delta: dayDelta, pct: dayPct },
        week: periodMove(c.symbol, c.quantity, last, 7),
        month: periodMove(c.symbol, c.quantity, last, 30),
      };
    }),
  ];

  function sumMoverWindow(key: "day" | "week" | "month") {
    const parts = movers.map((m) => m[key].delta).filter((d): d is number => d != null);
    if (!parts.length) return null;
    return parts.reduce((s, d) => s + d, 0);
  }

  const latestPath = path.length ? path[path.length - 1] : null;
  const pathAligned =
    latestPath != null &&
    Math.abs(latestPath.netWorth - netWorth) / Math.max(Math.abs(netWorth), 1) < 0.15;
  const dayChange =
    (pathAligned ? changeFromPath(path, netWorth, 1) : null) ?? (hasQuoteMove ? holdingDayPl : sumMoverWindow("day"));
  const weekChange = (pathAligned ? changeFromPath(path, netWorth, 7) : null) ?? sumMoverWindow("week");
  const monthChange = (pathAligned ? changeFromPath(path, netWorth, 30) : null) ?? sumMoverWindow("month");

  const movedAccounts = accs
    .filter((a) => a.previousBalance != null && a.currentBalance != null)
    .map((a) => ({
      id: a.id,
      name: accountLabel(a.name, a.item.institutionName),
      mask: a.mask,
      institution: a.item.institutionName,
      owner: a.owner,
      previous: a.previousBalance!,
      current: a.currentBalance!,
      delta: a.currentBalance! - a.previousBalance!,
    }))
    .filter((a) => Math.abs(a.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 8);

  const largeTxns = txns
    .filter((t) => !isInternalMove(t) && Math.abs(t.amount) >= 500)
    .slice(0, 8)
    .map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      name: t.userMerchant || t.merchantName || t.name,
      amount: t.amount,
      account: accountLabel(t.account.name, t.account.item.institutionName),
      owner: t.account.owner,
    }));

  const holdingMoves = holds
    .filter((h) => h.quoteChange != null)
    .map((h) => ({
      symbol: h.symbol,
      name: h.name,
      dayPl: (h.quoteChange ?? 0) * h.quantity,
      dayPct: h.quoteChangePct,
    }))
    .sort((a, b) => Math.abs(b.dayPl) - Math.abs(a.dayPl))
    .slice(0, 8);

  const attention = buildAttention({
    items,
    accs,
    pols,
    props,
    names,
  });

  let lifeCoverage = 0;
  let liabilityCoverage = 0;
  for (const p of pols) {
    const cov = parseJson<Record<string, number | string>>(p.coverageJson, {});
    if (p.type === "life" && typeof cov.faceAmount === "number") lifeCoverage += cov.faceAmount;
    if ((p.type === "home" || p.type === "umbrella") && typeof cov.liability === "number") {
      liabilityCoverage += cov.liability;
    }
  }

  return {
    names,
    connected: items.length > 0,
    itemCount: items.length,
    accountCount: accs.length,
    lastSyncedAt: items.reduce<string | null>((latest, i) => {
      if (!i.lastSyncedAt) return latest;
      const iso = i.lastSyncedAt.toISOString();
      return !latest || iso > latest ? iso : latest;
    }, null),
    netWorth,
    dayChange,
    weekChange,
    monthChange,
    holdingDayPl: hasQuoteMove ? holdingDayPl : null,
    movers,
    tiles: {
      cash,
      investments,
      liabilities,
      realEstateEquity: reEquity,
      realEstateGross: realEstate,
      insurance: { policies: pols.length, lifeCoverage, liabilityCoverage },
    },
    allocation,
    allocationItems,
    path,
    moved: { accounts: movedAccounts, transactions: largeTxns, holdings: holdingMoves },
    attention,
  };
}

function buildAttention({
  items,
  accs,
  pols,
  props,
  names,
}: {
  items: { id: string; institutionName: string | null; status: string; lastSyncedAt: Date | null; errorMessage: string | null }[];
  accs: { name: string; hausType: string; currentBalance: number | null; limitAmount: number | null; item?: { institutionName: string | null } }[];
  pols: {
    type: string;
    carrier: string;
    renewalDate: Date | null;
    coverageJson: string;
    propertyId: string | null;
    documents?: { id: string }[];
  }[];
  props: { id: string; label: string; estimate: number }[];
  names: { nameA: string; nameB: string };
}) {
  const notes: { kind: string; title: string; detail: string }[] = [];
  const now = new Date();

  for (const item of items) {
    if (item.status === "relink") {
      notes.push({
        kind: "relink",
        title: `${item.institutionName ?? "Institution"} needs relink`,
        detail: item.errorMessage ?? "Plaid asked this item to sign in again.",
      });
    } else if (item.status === "error") {
      notes.push({
        kind: "error",
        title: `${item.institutionName ?? "Institution"} returned an error`,
        detail: item.errorMessage ?? "Last good data is still on the ledger.",
      });
    } else if (
      item.lastSyncedAt &&
      (now.getTime() - item.lastSyncedAt.getTime()) / 36e5 > STALE_CONNECTION_HOURS
    ) {
      notes.push({
        kind: "stale",
        title: `${item.institutionName ?? "Institution"} is stale`,
        detail: `Last sync more than ${STALE_CONNECTION_HOURS} hours ago.`,
      });
    }
  }

  for (const a of accs.filter((x) => x.hausType === "credit_card" && x.limitAmount)) {
    const used = Math.abs(a.currentBalance ?? 0);
    const util = used / (a.limitAmount as number);
    if (util >= HIGH_UTILIZATION) {
      notes.push({
        kind: "utilization",
        title: `${accountLabel(a.name, a.item?.institutionName)} utilization ${Math.round(util * 100)}%`,
        detail: `${used.toFixed(0)} of ${a.limitAmount} limit.`,
      });
    }
  }

  for (const p of pols) {
    if (p.renewalDate) {
      const days = differenceInCalendarDays(p.renewalDate, now);
      if (days >= 0 && days <= INSURANCE_RENEWAL_DAYS) {
        notes.push({
          kind: "renewal",
          title: `${p.carrier} ${p.type} renews in ${days} days`,
          detail: "Open Insurance to review the declarations page.",
        });
      }
    }
    if (!p.documents || p.documents.length === 0) {
      notes.push({
        kind: "upload",
        title: `${p.carrier} has no declarations upload`,
        detail: "Attach the original ID card or declarations page on Insurance.",
      });
    }
    if (p.type === "home") {
      const cov = parseJson<{ dwelling?: number }>(p.coverageJson, {});
      const prop = p.propertyId ? props.find((x) => x.id === p.propertyId) : props[0];
      if (cov.dwelling && prop?.estimate) {
        const gap = Math.abs(cov.dwelling - prop.estimate) / prop.estimate;
        if (gap > 0.2) {
          notes.push({
            kind: "dwelling",
            title: `Dwelling limit vs ${prop.label} estimate`,
            detail: `Policy dwelling ${cov.dwelling.toLocaleString()} vs estimate ${prop.estimate.toLocaleString()} (${names.nameA} / ${names.nameB} property).`,
          });
        }
      }
    }
  }

  return notes.slice(0, 10);
}

export async function getAccountsForFilter(filter: OwnerFilter) {
  const accounts = await prisma.account.findMany({ include: { item: true } });
  return accounts.filter((a) => matchesOwner(a.owner, filter));
}

export async function getCashflow(filter: OwnerFilter, month: Date, includeTransfers: boolean) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const lookbackStart = subDays(start, 400);

  const [txns, hidden, ignoredRecurring] = await Promise.all([
    prisma.txn.findMany({
      where: { date: { gte: lookbackStart, lt: end } },
      include: { account: true },
      orderBy: { date: "asc" },
    }),
    hiddenMerchantKeys(),
    ignoredRecurringKeys(),
  ]);
  const scoped = notHidden(txns, hidden).filter((t) => matchesOwner(t.account.owner, filter));
  const monthTxns = scoped.filter((t) => t.date >= start);

  const spendingOf = (t: (typeof txns)[number]) => {
    if (t.amount <= 0) return 0;
    if (!includeTransfers && isInternalMove(t)) return 0;
    const cat = effectiveCategory(t);
    if (cat === "INCOME") return 0;
    return t.amount;
  };
  const incomeOf = (t: (typeof txns)[number]) => {
    if (!includeTransfers && isInternalMove(t)) return 0;
    const cat = effectiveCategory(t);
    if (cat === "INCOME") return Math.abs(t.amount);
    if (t.amount < 0 && cat !== "TRANSFER_IN" && cat !== "TRANSFER_OUT") return -t.amount;
    return 0;
  };

  let income = 0;
  let spending = 0;
  const byCategory: Record<string, number> = {};
  for (const t of monthTxns) {
    income += incomeOf(t);
    const s = spendingOf(t);
    spending += s;
    if (s > 0) {
      const cat = effectiveCategory(t);
      byCategory[cat] = (byCategory[cat] ?? 0) + s;
    }
  }

  const savingsRate = income > 0 ? (income - spending) / income : null;

  const essentialLookback = scoped.filter((t) => t.date >= subDays(end, 90) && t.date < end);
  let essential = 0;
  for (const t of essentialLookback) {
    const cat = effectiveCategory(t);
    if (isInternalMove(t)) continue;
    if (t.amount > 0 && (cat === "RENT_AND_UTILITIES" || cat === "MEDICAL" || cat === "LOAN_PAYMENTS" || cat === "TRANSPORTATION" || cat === "GROCERIES")) {
      essential += t.amount;
    }
  }
  const monthlyEssential = essential / 3;
  const cashAccounts = (await prisma.account.findMany()).filter(
    (a) => matchesOwner(a.owner, filter) && isCashType(a.hausType),
  );
  const cash = cashAccounts.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
  const runway = monthlyEssential > 0 ? cash / monthlyEssential : null;

  const recurring = inferRecurring(scoped.filter((t) => t.date < end), ignoredRecurring);

  return {
    month: start.toISOString(),
    income,
    spending,
    savingsRate,
    cash,
    runway,
    monthlyEssential,
    byCategory: Object.entries(byCategory)
      .map(([key, value]) => ({ key, label: categoryLabel(key), value }))
      .sort((a, b) => b.value - a.value),
    recurring,
    txnCount: monthTxns.length,
  };
}

export function inferRecurring(
  txns: {
    merchantName: string | null;
    userMerchant: string | null;
    name: string;
    amount: number;
    date: Date;
    isTransfer: boolean;
    isCcPayment: boolean;
    userCategory?: string | null;
    categoryPrimary?: string | null;
    categoryDetailed?: string | null;
  }[],
  ignored: Set<string> = new Set(),
) {
  const groups = new Map<string, { label: string; amounts: number[]; dates: Date[] }>();
  for (const t of txns) {
    if (isInternalMove(t)) continue;
    if (t.amount <= 0) continue;
    const label = t.userMerchant || t.merchantName || t.name;
    const key = recurringMerchantKey(label);
    if (!key || ignored.has(key)) continue;
    const g = groups.get(key) ?? { label, amounts: [], dates: [] };
    g.amounts.push(t.amount);
    g.dates.push(t.date);
    groups.set(key, g);
  }
  const out: {
    label: string;
    amount: number;
    cadence: string;
    lastDate: string;
    annual: number;
  }[] = [];
  for (const g of groups.values()) {
    if (g.dates.length < 3) continue;
    const sorted = [...g.dates].sort((a, b) => a.getTime() - b.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / 86400000);
    }
    const avgGap = gaps.reduce((s, x) => s + x, 0) / gaps.length;
    let cadence = "irregular";
    let perYear = 0;
    if (avgGap >= 25 && avgGap <= 35) {
      cadence = "monthly";
      perYear = 12;
    } else if (avgGap >= 6 && avgGap <= 8) {
      cadence = "weekly";
      perYear = 52;
    } else if (avgGap >= 13 && avgGap <= 16) {
      cadence = "biweekly";
      perYear = 26;
    } else if (avgGap >= 350 && avgGap <= 380) {
      cadence = "annual";
      perYear = 1;
    } else continue;
    const mean = g.amounts.reduce((s, x) => s + x, 0) / g.amounts.length;
    const similar = g.amounts.every((a) => Math.abs(a - mean) / mean < 0.2);
    if (!similar) continue;
    out.push({
      label: g.label,
      amount: mean,
      cadence,
      lastDate: sorted[sorted.length - 1].toISOString(),
      annual: mean * perYear,
    });
  }
  return out.sort((a, b) => b.annual - a.annual);
}

export async function getTransactions(filter: OwnerFilter) {
  const names = await getNames();
  const [txns, hidden] = await Promise.all([
    prisma.txn.findMany({
      include: { account: { include: { item: true } } },
      orderBy: { date: "desc" },
      take: 5000,
    }),
    hiddenMerchantKeys(),
  ]);
  return notHidden(txns, hidden).filter((t) => matchesOwner(t.account.owner, filter)).map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    name: t.name,
    merchant: t.userMerchant || t.merchantName || t.name,
    rawMerchant: t.merchantName,
    account: accountLabel(t.account.name, t.account.item.institutionName),
    accountMask: t.account.mask,
    institution: t.account.item.institutionName,
    owner: t.account.owner,
    ownerLabel: ownerLabel(t.account.owner, names),
    category: effectiveCategory(t),
    categoryDetailed: t.categoryDetailed,
    amount: t.amount,
    pending: t.pending,
    isTransfer: t.isTransfer,
    isCcPayment: t.isCcPayment,
  }));
}

export async function getInvestments(filter: OwnerFilter) {
  const names = await getNames();
  const holdings = await prisma.holding.findMany({
    include: { account: { include: { item: true } } },
  });
  const scoped = holdings.filter(
    (h) =>
      matchesOwner(h.account.owner, filter) &&
      !isRetirementAccount(h.account) &&
      !isCryptoHoldingType(h.type),
  );
  const lots = scoped.map((h) => {
    const value = holdingValue(h);
    const last = holdingPrice(h);
    const cost = h.costBasis ?? null;
    const dayPl = h.quoteChange != null ? h.quoteChange * h.quantity : null;
    const totalPl = cost != null ? value - cost : null;
    return {
      id: h.id,
      symbol: h.symbol,
      name: h.name,
      class: formatHoldingClass(h.type),
      account: accountLabel(h.account.name, h.account.item.institutionName),
      institution: h.account.item.institutionName,
      owner: h.account.owner,
      ownerLabel: ownerLabel(h.account.owner, names),
      taxable: !isRetirementType(h.account.hausType) && !isChildAccountType(h.account.hausType),
      qty: h.quantity,
      last,
      value,
      costBasis: cost,
      dayPl,
      totalPl,
      dayPct: h.quoteChangePct,
      manual: false as boolean,
      accounts: [accountLabel(h.account.name, h.account.item.institutionName)],
      brandKind: (h.type === "cryptocurrency" ? "crypto" : "security") as BrandKind,
    };
  });
  const rows = consolidateBySymbol(lots);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const withWeight = rows.map((r) => ({ ...r, weight: total > 0 ? r.value / total : 0 }));

  const byClass: Record<string, number> = {};
  const byAccount: Record<string, number> = {};
  const byOwner: Record<string, number> = {};
  for (const r of withWeight) {
    const cls = r.class || "other";
    byClass[cls] = (byClass[cls] ?? 0) + r.value;
    byAccount[r.account] = (byAccount[r.account] ?? 0) + r.value;
    byOwner[r.ownerLabel] = (byOwner[r.ownerLabel] ?? 0) + r.value;
  }

  const taxableTotal = withWeight.filter((r) => r.taxable).reduce((s, r) => s + r.value, 0);
  const concentration = withWeight
    .filter((r) => r.taxable && r.symbol)
    .reduce<Record<string, number>>((acc, r) => {
      acc[r.symbol!] = (acc[r.symbol!] ?? 0) + r.value;
      return acc;
    }, {});
  const flags = Object.entries(concentration)
    .map(([symbol, value]) => ({
      symbol,
      value,
      weight: taxableTotal > 0 ? value / taxableTotal : 0,
    }))
    .filter((x) => x.weight > CONCENTRATION_FLAG)
    .sort((a, b) => b.weight - a.weight);

  const trades = (
    await prisma.investmentTxn.findMany({
      include: { account: { include: { item: true } }, security: true },
      orderBy: { date: "desc" },
      take: 400,
    })
  )
    .filter(
      (t) =>
        matchesOwner(t.account.owner, filter) &&
        !isRetirementAccount(t.account) &&
        !isCryptoHoldingType(t.security?.type),
    )
    .map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      name: t.name,
      type: t.type,
      subtype: t.subtype,
      symbol: t.security?.symbol ?? null,
      account: accountLabel(t.account.name, t.account.item.institutionName),
      owner: t.account.owner,
      quantity: t.quantity,
      amount: t.amount,
      price: t.price,
      fees: t.fees,
    }));

  const [manualRows, manualMeta] = await Promise.all([
    prisma.manualHolding.findMany({ where: { kind: "security" } }),
    prisma.$queryRaw<{ id: string; assetClass: string | null; accountName: string | null }[]>`
      SELECT id, assetClass, accountName FROM ManualHolding WHERE kind = 'security'
    `,
  ]);
  const metaById = new Map(manualMeta.map((m) => [m.id, m]));
  const manuals = manualRows
    .filter((h) => matchesOwner(h.owner, filter))
    .map((h) => {
      const meta = metaById.get(h.id);
      return {
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        quantity: h.quantity,
        quotePrice: h.quotePrice,
        coingeckoId: h.coingeckoId,
        notes: h.notes,
        assetClass: meta?.assetClass || "equity",
        accountName: meta?.accountName || "Manual",
        ownerLabel: ownerLabel(h.owner, names),
        value: h.coingeckoId === FIXED_USD_ID ? (h.quotePrice ?? 0) : (h.quotePrice ?? 0) * h.quantity,
      };
    })
    .sort((a, b) => b.value - a.value);

  return {
    names,
    total,
    rows: withWeight.sort((a, b) => b.value - a.value),
    manuals,
    byClass: Object.entries(byClass).map(([k, v]) => ({ key: k, value: v })),
    byAccount: Object.entries(byAccount).map(([k, v]) => ({ key: k, value: v })),
    byOwner: Object.entries(byOwner).map(([k, v]) => ({ key: k, value: v })),
    flags,
    trades,
    hasQuotes: scoped.some((h) => h.quotePrice != null),
  };
}

export async function getBrokerageCrypto(filter: OwnerFilter) {
  const names = await getNames();
  const holdings = await prisma.holding.findMany({
    include: { account: { include: { item: true } } },
  });
  const scoped = holdings.filter(
    (h) =>
      matchesOwner(h.account.owner, filter) &&
      !isRetirementAccount(h.account) &&
      isCryptoHoldingType(h.type),
  );
  type Group = {
    id: string;
    institution: string;
    owner: string;
    ownerLabel: string;
    assets: {
      id: string;
      symbol: string;
      name: string;
      quantity: number;
      quotePrice: number | null;
      value: number;
    }[];
  };
  const groups = new Map<string, Group>();
  for (const h of scoped) {
    const institution = (h.account.item.institutionName || "Brokerage").trim() || "Brokerage";
    const key = `${institution.toLowerCase()}\0${h.account.owner}`;
    let g = groups.get(key);
    if (!g) {
      const slug = institution.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brokerage";
      g = {
        id: `brokerage:${slug}:${h.account.owner}`,
        institution,
        owner: h.account.owner,
        ownerLabel: ownerLabel(h.account.owner, names),
        assets: [],
      };
      groups.set(key, g);
    }
    const value = holdingValue(h);
    const qty = h.quantity;
    g.assets.push({
      id: h.id,
      symbol: (h.symbol || h.name).trim() || h.name,
      name: h.name,
      quantity: qty,
      quotePrice: qty ? value / qty : value,
      value,
    });
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      assets: g.assets.filter((a) => a.value >= 10).sort((a, b) => b.value - a.value),
    }))
    .filter((g) => g.assets.length > 0)
    .sort((a, b) => a.institution.localeCompare(b.institution) || a.ownerLabel.localeCompare(b.ownerLabel));
}

export async function getSymbolDetail(symbol: string, filter: OwnerFilter) {
  const names = await getNames();
  const upper = symbol.toUpperCase();
  const holdings = await prisma.holding.findMany({
    include: { account: { include: { item: true } } },
  });
  const lots = holdings
    .filter((h) => matchesOwner(h.account.owner, filter) && h.symbol?.toUpperCase() === upper)
    .map((h) => ({
    id: h.id,
    account: accountLabel(h.account.name, h.account.item.institutionName),
    institution: h.account.item.institutionName,
    owner: h.account.owner,
    ownerLabel: ownerLabel(h.account.owner, names),
    quantity: h.quantity,
    quotePrice: h.quotePrice,
    institutionPrice: h.institutionPrice,
    institutionValue: h.institutionValue,
    costBasis: h.costBasis,
    quoteChange: h.quoteChange,
    quoteChangePct: h.quoteChangePct,
    manual: false,
  }));
  const coins = (await loadCryptoLots()).filter(
    (c) => matchesOwner(c.owner, filter) && c.symbol.toUpperCase() === upper,
  );
  for (const c of coins) {
    lots.push({
      id: c.id,
      account: "Self-custody",
      institution: "Self-custody",
      owner: c.owner,
      ownerLabel: ownerLabel(c.owner, names),
      quantity: c.quantity,
      quotePrice: c.quotePrice,
      institutionPrice: null,
      institutionValue: null,
      costBasis: c.costBasis,
      quoteChange: c.quoteChange,
      quoteChangePct: c.quoteChangePct,
      manual: true,
    });
  }
  const trades = (
    await prisma.investmentTxn.findMany({
      include: { account: { include: { item: true } }, security: true },
      orderBy: { date: "desc" },
    })
  )
    .filter(
      (t) =>
        matchesOwner(t.account.owner, filter) &&
        (t.security?.symbol?.toUpperCase() === upper || t.name.toUpperCase().includes(upper)),
    )
    .map((t) => ({
      ...t,
      accountLabel: accountLabel(t.account.name, t.account.item.institutionName),
    }));
  return { names, symbol, lots, trades };
}

export async function getRetirement(filter: OwnerFilter) {
  const names = await getNames();
  const accounts = (await prisma.account.findMany({ include: { item: true, investmentTxns: true, holdings: true } })).filter(
    (a) =>
      matchesOwner(a.owner, filter) && isRetirementAccount(a),
  );
  const year = IRS_LIMITS_YEAR;
  const yStart = new Date(year, 0, 1);
  const yEnd = new Date(year + 1, 0, 1);

  const rows = accounts.map((a) => {
    const kind = a.retirementKind || a.hausType;
    const ytd = a.investmentTxns
      .filter((t) => t.date >= yStart && t.date < yEnd)
      .filter((t) => {
        const sub = (t.subtype || "").toLowerCase();
        const type = (t.type || "").toLowerCase();
        return sub.includes("contribution") || type === "cash" && sub.includes("deposit") || sub.includes("transfer");
      })
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const limit =
      kind === "hsa" ? IRS_LIMITS.hsaFamily : kind === "401k" || kind === "403b" ? IRS_LIMITS.electiveDeferral : IRS_LIMITS.ira;
    const holdings: {
      label: string;
      value: number;
      symbol: string | null;
      name: string;
      kind: "crypto" | "security" | "institution";
    }[] = a.holdings
      .map((h) => {
        const value = holdingValue(h);
        return {
          label: h.symbol ? `${h.symbol} · ${h.name}` : h.name,
          value,
          symbol: h.symbol,
          name: h.name,
          kind: (h.type === "cryptocurrency" ? "crypto" : "security") as "crypto" | "security",
        };
      })
      .filter((h) => Math.abs(h.value) >= 10)
      .sort((x, y) => y.value - x.value);
    const held = holdings.reduce((s, h) => s + h.value, 0);
    const cashLeft = (a.currentBalance ?? 0) - held;
    if (cashLeft >= 10) {
      holdings.push({
        label: "Cash",
        value: cashLeft,
        symbol: null,
        name: "Cash",
        kind: "institution" as const,
      });
    }
    return {
      id: a.id,
      name: accountLabel(a.name, a.item.institutionName),
      institution: a.item.institutionName,
      owner: a.owner,
      ownerLabel: ownerLabel(a.owner, names),
      kind,
      balance: a.currentBalance ?? 0,
      ytd,
      limit,
      holdings,
      manual: false as boolean,
    };
  });

  const manuals = (await prisma.manualAccount.findMany()).filter(
    (m) => matchesOwner(m.owner, filter) && m.hausType === "hsa",
  );
  for (const m of manuals) {
    rows.push({
      id: m.id,
      name: m.name,
      institution: "Manual",
      owner: m.owner,
      ownerLabel: ownerLabel(m.owner, names),
      kind: "hsa",
      balance: m.balance,
      ytd: 0,
      limit: IRS_LIMITS.hsaFamily,
      holdings:
        m.balance >= 10
          ? [{ label: m.name, value: m.balance, symbol: null, name: m.name, kind: "institution" as const }]
          : [],
      manual: true,
    });
  }

  return { names, year, limits: IRS_LIMITS, rows };
}

export async function getRealEstate(filter: OwnerFilter) {
  const names = await getNames();
  try {
    const properties = (await prisma.property.findMany()).filter((p) => matchesOwner(p.owner, filter));
    const loans = (await prisma.account.findMany({ include: { item: true } })).filter(
      (a) => a.hausType === "mortgage" || a.hausType === "installment",
    );
    const rows = properties.map((p) => {
      const linked = p.mortgageAccountId ? loans.find((l) => l.id === p.mortgageAccountId) : null;
      const manual = (p as { mortgageBalance?: number | null }).mortgageBalance ?? null;
      const balance = propertyDebt({ ...p, mortgageBalance: manual }, loans);
      const equity = p.estimate - balance;
      const ltv = p.estimate > 0 ? balance / p.estimate : null;
      return {
        ...p,
        mortgageBalance: manual,
        loanName: linked ? accountLabel(linked.name, linked.item.institutionName) : manual ? "Manual" : null,
        loanBalance: balance,
        equity,
        ltv,
      };
    });
    return {
      names,
      rows,
      loans: loans.map((l) => ({
        id: l.id,
        name: accountLabel(l.name, l.item.institutionName),
        owner: l.owner,
      })),
    };
  } catch {
    return { names, rows: [], loans: [] };
  }
}

export async function getInsurance(filter: OwnerFilter) {
  const names = await getNames();
  const policies = (
    await prisma.insurancePolicy.findMany({ include: { documents: true } })
  ).filter((p) => matchesOwner(p.owner, filter));
  const properties = await prisma.property.findMany();
  const vehicles = await prisma.vehicle.findMany({ orderBy: { createdAt: "asc" } });
  return { names, policies, properties, vehicles };
}

export async function getChildrenView() {
  const names = await getNames();
  const accounts = (await prisma.account.findMany({ include: { item: true } })).filter(
    (a) => isChildAccountType(a.hausType) || a.owner.startsWith("child:"),
  );
  const manuals = await prisma.manualAccount.findMany({
    where: { hausType: { in: ["529", "custodial", "trump"] } },
  });
  const contribs = await prisma.investmentTxn.findMany({
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      date: { gte: new Date(IRS_LIMITS_YEAR, 0, 1) },
    },
  });
  return { names, accounts, manuals, contribs };
}

export async function getReports(filter: OwnerFilter) {
  const [allTxns, hidden, ignoredRecurring] = await Promise.all([
    prisma.txn.findMany({
      include: { account: true },
      orderBy: { date: "asc" },
    }),
    hiddenMerchantKeys(),
    ignoredRecurringKeys(),
  ]);
  const txns = notHidden(allTxns, hidden).filter((t) => matchesOwner(t.account.owner, filter));

  const flows: {
    date: string;
    month: string;
    kind: "spend" | "income" | "invest";
    category: string;
    merchant: string;
    amount: number;
  }[] = [];
  for (const t of txns) {
    const month = ymKey(t.date);
    const date = dayKey(t.date);
    const cat = effectiveCategory(t);
    const merch = t.userMerchant || t.merchantName || t.name;
    if (
      cat === "INCOME" ||
      (t.amount < 0 &&
        cat !== "TRANSFER_IN" &&
        cat !== "TRANSFER_OUT" &&
        !t.isTransfer &&
        !isCreditCardPayment(t))
    ) {
      const src = incomeSourceLabel({ ...t, accountName: t.account.name });
      flows.push({
        date,
        month,
        kind: "income",
        category: src,
        merchant: merch || src,
        amount: Math.abs(t.amount),
      });
    } else if (isInvestFunding(t) && t.amount > 0) {
      flows.push({
        date,
        month,
        kind: "invest",
        category: "To investments",
        merchant: merch,
        amount: t.amount,
      });
    } else if (isInternalMove(t)) {
      continue;
    } else if (t.amount > 0) {
      flows.push({
        date,
        month,
        kind: "spend",
        category: categoryLabel(cat),
        merchant: merch,
        amount: t.amount,
      });
    }
  }

  return {
    flows,
    recurring: inferRecurring(txns, ignoredRecurring),
  };
}

export async function getInsights(filter: OwnerFilter) {
  const overview = await getOverview(filter);
  const cashflow = await getCashflow(filter, new Date(), false);
  const inv = await getInvestments(filter);
  const insurance = await getInsurance(filter);
  const now = new Date();
  const cards: {
    section: string;
    title: string;
    math: string;
    value: string;
    tone: "neutral" | "positive" | "negative";
  }[] = [];

  const subAnnual = cashflow.recurring.reduce((s, r) => s + r.annual, 0);
  cards.push({
    section: "Liquidity",
    title: "Inferred subscriptions",
    math: cashflow.recurring.map((r) => `${r.label} ${formatMath(r.amount)} × ${r.cadence}`).join(" + ") || "No recurring series with ≥3 similar charges yet.",
    value: formatMath(subAnnual) + " / yr",
    tone: "neutral",
  });

  cards.push({
    section: "Questions",
    title: "If we both stopped working",
    math:
      cashflow.monthlyEssential > 0
        ? `Cash ${formatMath(cashflow.cash)} lasts ${(cashflow.cash / cashflow.monthlyEssential).toFixed(1)} mo at ${formatMath(cashflow.monthlyEssential)}/mo essential. Net worth ${formatMath(overview.netWorth)} is ${(overview.netWorth / (cashflow.monthlyEssential * 12)).toFixed(1)} years at that burn.`
        : "Need ~90 days of housing, medical, loan, grocery, and transport charges to estimate a burn rate.",
    value:
      cashflow.monthlyEssential > 0
        ? `${(cashflow.cash / cashflow.monthlyEssential).toFixed(1)} mo cash`
        : "—",
    tone: cashflow.runway != null && cashflow.runway < 12 ? "negative" : "neutral",
  });

  cards.push({
    section: "Liquidity",
    title: "Emergency fund months",
    math:
      cashflow.monthlyEssential > 0
        ? `${formatMath(cashflow.cash)} cash ÷ ${formatMath(cashflow.monthlyEssential)} trailing essential / month`
        : "Need 90 days of rent, medical, loan, and transport charges to compute runway.",
    value: cashflow.runway != null ? `${cashflow.runway.toFixed(1)} mo` : "—",
    tone: cashflow.runway != null && cashflow.runway < 3 ? "negative" : "neutral",
  });

  if (inv.flags[0]) {
    cards.push({
      section: "Portfolio",
      title: "Taxable single-name concentration",
      math: `${inv.flags[0].symbol} ${formatMath(inv.flags[0].value)} / taxable ${formatMath(
        inv.rows.filter((r) => r.taxable).reduce((s, r) => s + r.value, 0),
      )} = ${(inv.flags[0].weight * 100).toFixed(1)}% (flag > 15%)`,
      value: `${inv.flags[0].symbol} ${(inv.flags[0].weight * 100).toFixed(1)}%`,
      tone: "negative",
    });
  }

  for (const p of insurance.policies) {
    if (!p.renewalDate) continue;
    const days = differenceInCalendarDays(p.renewalDate, now);
    if (days <= INSURANCE_RENEWAL_DAYS) {
      cards.push({
        section: "Insurance",
        title: `${p.carrier} renewal`,
        math: `Renewal ${p.renewalDate.toISOString().slice(0, 10)} − today = ${days} days`,
        value: days < 0 ? "Expired" : `${days} days`,
        tone: days <= 30 ? "negative" : "neutral",
      });
    }
  }

  const merchants = await unusualMerchants(filter);
  cards.push(...merchants);

  return { cards, overviewNet: overview.netWorth };
}

function formatMath(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

async function unusualMerchants(filter: OwnerFilter) {
  const since = subDays(new Date(), 90);
  const hidden = await hiddenMerchantKeys();
  const txns = notHidden(
    await prisma.txn.findMany({
      where: { date: { gte: since }, pending: false },
      include: { account: true },
    }),
    hidden,
  ).filter((t) => matchesOwner(t.account.owner, filter) && t.amount > 0 && !isInternalMove(t));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const groups = new Map<string, { label: string; month: number[]; prior: number[] }>();
  for (const t of txns) {
    const label = t.userMerchant || t.merchantName || t.name;
    const key = label.toLowerCase();
    const g = groups.get(key) ?? { label, month: [], prior: [] };
    if (t.date >= monthStart) g.month.push(t.amount);
    else g.prior.push(t.amount);
    groups.set(key, g);
  }
  const cards: {
    section: string;
    title: string;
    math: string;
    value: string;
    tone: "neutral" | "positive" | "negative";
  }[] = [];
  for (const g of groups.values()) {
    if (g.prior.length < 2 || g.month.length === 0) continue;
    const avg = g.prior.reduce((s, x) => s + x, 0) / g.prior.length;
    const latest = g.month[g.month.length - 1];
    if (avg > 0 && latest > avg * 2 && latest >= 80) {
      cards.push({
        section: "Activity",
        title: `Unusual spend · ${g.label}`,
        math: `Latest ${formatMath(latest)} vs 90-day merchant average ${formatMath(avg)}`,
        value: `${((latest / avg - 1) * 100).toFixed(0)}% above avg`,
        tone: "negative",
      });
    }
  }
  return cards.slice(0, 4);
}

export async function getSettings() {
  const names = await getNames();
  const items = await prisma.plaidItem.findMany({
    include: { accounts: true },
    orderBy: { createdAt: "asc" },
  });
  const properties = await prisma.property.findMany();
  const vehicles = await prisma.vehicle.findMany();
  return { names, items, properties, vehicles, plaidReady: Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET) };
}

export { ownerLabel };
