import { prisma, ensureHousehold } from "./db";
import { childLabelFor, matchesOwner, ownerLabel, withHolder, type OwnerFilter } from "./owners";
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
import { loadCardPaymentFlags } from "./card-payments";
import { effectiveCategory, isInternalMove, isInvestFunding, isTransferCategory, recurringMerchantKey, txnMerchantKey } from "./categories";
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
import { ellipsize, formatHoldingClass, formatMoney, startOfDay } from "./format";
import { differenceInCalendarDays, subDays } from "date-fns";
import { accountLabel } from "./account-label";
import { reconstructNetWorthPath } from "./history";
import { equityDayMoves, historyAgreesWithSpot, isOptionSymbol, loadPriceMap, optionPremiumScale, priceOnOrBefore, quoteSymbol, RECENT_CLOSE_DAYS } from "./quotes";
import { propertyDebt, vehicleDebt } from "./property";
import { loadCryptoLots, lotValue } from "./crypto-lots";
import type { BrandKind } from "./logos";

export async function getNames() {
  const household = await ensureHousehold();
  const children = await prisma.child.findMany({ orderBy: { name: "asc" } });
  return {
    nameA: household.nameA,
    nameB: household.nameB,
    birthdateA: household.birthdateA?.toISOString().slice(0, 10) ?? null,
    birthdateB: household.birthdateB?.toISOString().slice(0, 10) ?? null,
    quoteApiKey: household.quoteApiKey,
    pairCardPayments: household.pairCardPayments,
    tabs: {
      crypto: household.showCrypto,
      retirement: household.showRetirement,
      property: household.showProperty,
      insurance: household.showInsurance,
      insights: household.showInsights,
    },
    keepTransactions: household.keepTransactions,
    children,
  };
}

async function withCardFlags<T extends { id: string }>(rows: T[]) {
  const flags = await loadCardPaymentFlags();
  return rows.map((t) => ({
    ...t,
    pairedTransfer: flags.enabled && flags.paired.has(t.id),
  }));
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
    const groupKey = `${sym}::${r.owner}::${r.account}`;
    const list = groups.get(groupKey) ?? [];
    list.push(r);
    groups.set(groupKey, list);
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
  const liabilityIds = new Set<string>();
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
    const base = accountLabel(a.name, a.item.institutionName);
    const holder =
      isChildAccountType(a.hausType) || a.owner.startsWith("child:")
        ? (childLabelFor(names, { owner: a.owner, name: base }) ?? ownerLabel(a.owner, names))
        : ownerLabel(a.owner, names);
    const label = withHolder(base, holder);
    const logoName = a.item.institutionName || base;
    const plaidType = (a.type || "").toLowerCase();
    const asLiability =
      isLiabilityType(a.hausType) || plaidType === "credit" || plaidType === "loan";
    if (isCashType(a.hausType) && !asLiability) {
      cash += bal;
      allocation.cash += bal;
      if (Math.abs(bal) >= 10) allocationItems.cash.push({ label, value: bal, name: logoName, kind: "institution" });
    } else if (asLiability) {
      liabilities += Math.abs(bal);
      liabilityIds.add(a.id);
    } else if (isInvestmentType(a.hausType)) {
      investments += bal;
      const bucket = allocationBucket(a.hausType);
      allocation[bucket] += bal;
      if (Math.abs(bal) >= 10) allocationItems[bucket].push({ label, value: bal, name: logoName, kind: "institution" });
    } else {
      otherAssets += bal;
      allocation.other += bal;
      if (Math.abs(bal) >= 10) allocationItems.other.push({ label, value: bal, name: logoName, kind: "institution" });
    }
  }
  for (const m of mans) {
    investments += m.balance;
    const bucket = allocationBucket(m.hausType);
    allocation[bucket] += m.balance;
    if (Math.abs(m.balance) >= 10) {
      allocationItems[bucket].push({
        label: withHolder(
          m.name,
          isChildAccountType(m.hausType) || m.owner.startsWith("child:")
            ? (childLabelFor(names, { owner: m.owner, name: m.name, beneficiary: m.beneficiary }) ??
              ownerLabel(m.owner, names))
            : ownerLabel(m.owner, names),
        ),
        value: m.balance,
        name: m.name,
        kind: "institution",
      });
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
    const label = withHolder(
      accountLabel(h.account.name, h.account.item.institutionName),
      ownerLabel(h.account.owner, names),
    );
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
  // Debt already netted into property / vehicle equity; kept apart so the tiles don't count it twice.
  let securedDebt = 0;
  const countedInLiabilities = (linkedId: string | null | undefined) =>
    linkedId ? liabilityIds.has(linkedId) : true; // manual balances are added below
  for (const p of props) {
    const loan = propertyDebt(p, accs);
    const equity = p.estimate - loan;
    reEquity += equity;
    if (countedInLiabilities(p.mortgageAccountId)) securedDebt += loan;
    allocation.real_estate += equity;
    if (Math.abs(equity) >= 10) {
      allocationItems.real_estate.push({ label: p.label, value: equity, name: p.label, kind: "institution" });
    }
    if (!p.mortgageAccountId) manualMortgages += loan;
  }
  liabilities += manualMortgages;

  let vehicleEquity = 0;
  for (const v of vehs) {
    const loan = vehicleDebt(v, accs);
    const equity = v.estimate - loan;
    vehicleEquity += equity;
    if (countedInLiabilities(v.loanAccountId)) securedDebt += loan;
    allocation.vehicles += equity;
    if (Math.abs(equity) >= 10) {
      allocationItems.vehicles.push({ label: v.label, value: equity, name: v.label, kind: "institution" });
    }
    if (!v.loanAccountId) liabilities += loan;
  }

  const netWorth = cash + investments + realEstate + otherAssets - liabilities;
  // Tiles partition net worth exactly: investments + cash + equity − unsecured debt.
  const equity = reEquity + vehicleEquity + (otherAssets - vehicleTotal);
  const unsecuredDebt = Math.max(0, liabilities - securedDebt);

  const quotedManuals = stockManuals.filter(
    (row) => matchesOwner(row.owner, filter) && row.coingeckoId !== FIXED_USD_ID,
  );
  const holdingDayPl =
    holds.reduce((s, h) => (h.quoteChange != null ? s + h.quoteChange * h.quantity : s), 0) +
    coins.reduce((s, c) => (c.quoteChange != null ? s + c.quoteChange * c.quantity : s), 0) +
    quotedManuals.reduce((s, h) => (h.quoteChange != null ? s + h.quoteChange * h.quantity : s), 0);
  const hasQuoteMove =
    holds.some((h) => h.quoteChange != null) ||
    coins.some((c) => c.quoteChange != null) ||
    quotedManuals.some((h) => h.quoteChange != null);

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
    const recent = priceOnOrBefore(priceMap, key, now, RECENT_CLOSE_DAYS);
    if (recent != null && !historyAgreesWithSpot(recent, last)) return { delta: null, pct: null };
    const then = priceOnOrBefore(priceMap, key, subDays(now, days), 10);
    if (then == null || then <= 0) return { delta: null, pct: null };
    // No bar near today: still refuse a history price on a different scale from the holding.
    if (recent == null) {
      const ratio = then / last;
      if (ratio > 30 || ratio < 1 / 30) return { delta: null, pct: null };
    }
    const delta = (last - then) * qty;
    const pct = ((last - then) / then) * 100;
    return { delta, pct };
  }

  const dayMoves = await equityDayMoves(
    valuedHolds
      .filter((x) => x.h.quoteChange == null && x.h.symbol && !isCryptoHoldingType(x.h.type))
      .map((x) => x.h.symbol as string),
  );

  const movers = [
    ...valuedHolds.map(({ h, value, last }) => {
      const hist1 = periodMove(h.symbol, h.quantity, last, 1);
      const live = h.symbol ? dayMoves.get(quoteSymbol(h.symbol)) : undefined;
      const scale =
        h.symbol && live && isOptionSymbol(h.symbol)
          ? optionPremiumScale(h.institutionPrice ?? h.quotePrice, live.price)
          : 1;
      const dayDelta =
        h.quoteChange != null ? h.quoteChange * h.quantity : live ? live.change * scale * h.quantity : hist1.delta;
      const dayPct = h.quoteChangePct ?? live?.changePct ?? hist1.pct;
      return {
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        kind: (isCryptoHoldingType(h.type) ? "crypto" : "security") as "crypto" | "security",
        retirement: isRetirementAccount(h.account),
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
  // Day is the live quote move (prior close → now). The reconstructed path is the wrong baseline
  // for one day: most symbols have no trustworthy history, so they are pinned at today's price
  // and a rally disappears, and a weekend sample often lands on the wrong close.
  const dayChange = hasQuoteMove
    ? holdingDayPl
    : (pathAligned ? changeFromPath(path, netWorth, 1) : null) ?? sumMoverWindow("day");
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

  const largeTxns = (await withCardFlags(txns))
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
      /** Property + vehicle + other-asset equity, net of the loans secured on them. */
      equity,
      /** Liabilities not already netted into `equity` (cards, student and personal loans). */
      unsecuredDebt,
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
  const scoped = await withCardFlags(notHidden(txns, hidden).filter((t) => matchesOwner(t.account.owner, filter)));
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
    if (t.amount < 0 && !isTransferCategory(cat)) return -t.amount;
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

function ledgerMerchant(t: { userMerchant?: string | null; merchantName?: string | null; name: string }) {
  return t.userMerchant || t.merchantName || t.name;
}

async function loadVisibleTxns(filter: OwnerFilter) {
  const [allTxns, hidden] = await Promise.all([
    prisma.txn.findMany({
      include: { account: { include: { item: true } } },
      orderBy: { date: "desc" },
    }),
    hiddenMerchantKeys(),
  ]);
  return withCardFlags(notHidden(allTxns, hidden).filter((t) => matchesOwner(t.account.owner, filter)));
}

export async function getTransactions(filter: OwnerFilter) {
  const names = await getNames();
  const visible = await loadVisibleTxns(filter);
  return visible.map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    name: t.name,
    merchant: ledgerMerchant(t),
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
    internal: isInternalMove(t),
    cardMatch: t.pairedTransfer ? ("matched" as const) : null,
    memo: t.memo,
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
  const dayMoves = await equityDayMoves(
    scoped.filter((h) => h.quoteChange == null && h.symbol).map((h) => h.symbol as string),
  );
  const lots = scoped.map((h) => {
    const value = holdingValue(h);
    const last = holdingPrice(h);
    const cost = h.costBasis ?? null;
    const live = h.symbol ? dayMoves.get(quoteSymbol(h.symbol)) : undefined;
    const scale =
      h.symbol && live && isOptionSymbol(h.symbol)
        ? optionPremiumScale(h.institutionPrice ?? h.quotePrice, live.price)
        : 1;
    const perShare = h.quoteChange ?? (live ? live.change * scale : null);
    const dayPl = perShare != null ? perShare * h.quantity : null;
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
      dayPct: h.quoteChangePct ?? live?.changePct ?? null,
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

  const manualRows = await prisma.manualHolding.findMany({ where: { kind: "security" } });
  const manualMoves = await equityDayMoves(
    manualRows.filter((h) => h.quoteChange == null && h.coingeckoId !== FIXED_USD_ID).map((h) => h.symbol),
  );
  const manuals = manualRows
    .filter((h) => matchesOwner(h.owner, filter))
    .map((h) => {
      const live = manualMoves.get(quoteSymbol(h.symbol));
      const quoteChange = h.quoteChange ?? live?.change ?? null;
      const quoteChangePct = h.quoteChangePct ?? live?.changePct ?? null;
      return {
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        quantity: h.quantity,
        quotePrice: h.quotePrice ?? live?.price ?? null,
        quoteChange,
        quoteChangePct,
        costBasis: h.costBasis,
        coingeckoId: h.coingeckoId,
        notes: h.notes,
        assetClass: h.assetClass || "equity",
        accountName: h.accountName || "Manual",
        owner: h.owner,
        ownerLabel: ownerLabel(h.owner, names),
        updatedAt: (h.editedAt ?? h.createdAt).toISOString(),
        value:
          h.coingeckoId === FIXED_USD_ID
            ? (h.quotePrice ?? 0)
            : (h.quotePrice ?? live?.price ?? 0) * h.quantity,
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
      quoteChange: number | null;
      quoteChangePct: number | null;
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
      quoteChange: h.quoteChange,
      quoteChangePct: h.quoteChangePct,
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
      matchesOwner(a.owner, filter) &&
      (isRetirementAccount(a) || isChildAccountType(a.hausType)),
  );
  const year = IRS_LIMITS_YEAR;
  const yStart = new Date(year, 0, 1);
  const yEnd = new Date(year + 1, 0, 1);

  const rows = accounts.map((a) => {
    const kind = a.retirementKind || a.hausType;
    const inst = (a.item.institutionName || "").trim();
    const ytd = a.investmentTxns
      .filter((t) => t.date >= yStart && t.date < yEnd)
      .filter((t) => {
        const sub = (t.subtype || "").toLowerCase();
        const type = (t.type || "").toLowerCase();
        return sub.includes("contribution") || type === "cash" && sub.includes("deposit") || sub.includes("transfer");
      })
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const limit: number =
      kind === "hsa" ? IRS_LIMITS.hsaFamily : kind === "401k" || kind === "403b" ? IRS_LIMITS.electiveDeferral : IRS_LIMITS.ira;
    const holdings: {
      label: string;
      value: number;
      symbol: string | null;
      name: string;
      logoName?: string | null;
      kind: "crypto" | "security" | "institution";
    }[] = a.holdings
      .map((h) => {
        const value = holdingValue(h);
        const holdingName = h.name || h.symbol || "Holding";
        return {
          label: ellipsize(inst ? `${inst}: ${holdingName}` : holdingName, 40),
          value,
          symbol: h.symbol,
          name: holdingName,
          logoName: inst || holdingName,
          kind: "institution" as const,
        };
      })
      .filter((h) => Math.abs(h.value) >= 10)
      .sort((x, y) => y.value - x.value);
    const held = holdings.reduce((s, h) => s + h.value, 0);
    const cashLeft = (a.currentBalance ?? 0) - held;
    if (cashLeft >= 10) {
      holdings.push({
        label: ellipsize(inst ? `${inst}: Cash` : "Cash", 40),
        value: cashLeft,
        symbol: null,
        name: "Cash",
        logoName: inst || "Cash",
        kind: "institution" as const,
      });
    }
    const name = accountLabel(a.name, a.item.institutionName);
    return {
      id: a.id,
      name,
      institution: a.item.institutionName,
      owner: a.owner,
      ownerLabel: ownerLabel(a.owner, names),
      childLabel:
        isChildAccountType(kind) || a.owner.startsWith("child:")
          ? childLabelFor(names, { owner: a.owner, name })
          : null,
      kind,
      balance: a.currentBalance ?? 0,
      ytd,
      limit,
      holdings,
      manual: false as boolean,
      beneficiary: null as string | null,
    };
  });

  const manuals = (await prisma.manualAccount.findMany()).filter(
    (m) =>
      matchesOwner(m.owner, filter) &&
      (m.hausType === "hsa" || isChildAccountType(m.hausType)),
  );
  for (const m of manuals) {
    rows.push({
      id: m.id,
      name: m.name,
      institution: "Manual",
      owner: m.owner,
      ownerLabel: ownerLabel(m.owner, names),
      childLabel: childLabelFor(names, { owner: m.owner, name: m.name, beneficiary: m.beneficiary }),
      kind: m.hausType,
      balance: m.balance,
      ytd: 0,
      limit: m.hausType === "hsa" ? IRS_LIMITS.hsaFamily : m.hausType === "trump" ? IRS_LIMITS.trumpAccount : 0,
      holdings:
        m.balance >= 10
          ? [{ label: m.name, value: m.balance, symbol: null, name: m.name, kind: "institution" as const }]
          : [],
      manual: true,
      beneficiary: m.beneficiary,
    });
  }

  const ranked = rows.filter((r) => Math.abs(r.balance) > 0).sort((a, b) => b.balance - a.balance);
  return { names, year, limits: IRS_LIMITS, rows: ranked };
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
  const [visible, ignoredRecurring, hidden] = await Promise.all([
    loadVisibleTxns(filter),
    ignoredRecurringKeys(),
    hiddenMerchantKeys(),
  ]);
  const txns = visible;
  const livePlaid = new Set(txns.map((t) => t.plaidTransactionId));

  const flows: {
    id: string;
    date: string;
    month: string;
    kind: "spend" | "income" | "invest";
    category: string;
    merchant: string;
    amount: number;
  }[] = [];

  function pushLive(t: (typeof txns)[number]) {
    const date = dayKey(t.date);
    const month = date.slice(0, 7);
    const cat = effectiveCategory(t);
    const merch = ledgerMerchant(t);
    if (isInternalMove(t)) {
      if (isInvestFunding(t) && t.amount > 0) {
        flows.push({
          id: t.id,
          date,
          month,
          kind: "invest",
          category: "To investments",
          merchant: merch,
          amount: t.amount,
        });
      }
      return;
    }
    if (cat === "INCOME" || t.amount < 0) {
      const src = incomeSourceLabel({ ...t, accountName: t.account.name });
      flows.push({
        id: t.id,
        date,
        month,
        kind: "income",
        category: src,
        merchant: merch || src,
        amount: Math.abs(t.amount),
      });
    } else if (isInvestFunding(t) && t.amount > 0) {
      flows.push({
        id: t.id,
        date,
        month,
        kind: "invest",
        category: "To investments",
        merchant: merch,
        amount: t.amount,
      });
    } else if (t.amount > 0) {
      flows.push({
        id: t.id,
        date,
        month,
        kind: "spend",
        category: categoryLabel(cat),
        merchant: merch,
        amount: t.amount,
      });
    }
  }

  for (const t of txns) pushLive(t);

  // Older months Plaid no longer returns stay in the month table via the saved copy.
  const archived = await prisma.savedTxn.findMany({ orderBy: { date: "desc" } });
  // A month is only complete once every saved institution reaches it. The binding date is the
  // latest of the per-institution earliest days (a ~90-day card window starts later than a bank
  // that already had years on this machine).
  const earliestByInstitution = new Map<string, string>();
  let archiveCoversFrom: string | null = null;
  for (const s of archived) {
    if (!matchesOwner(s.owner, filter)) continue;
    const date = dayKey(s.date);
    const inst = s.institutionName || s.accountName || "account";
    const prev = earliestByInstitution.get(inst);
    if (!prev || date < prev) earliestByInstitution.set(inst, date);
    if (livePlaid.has(s.plaidTransactionId)) continue;
    if (hidden.has(txnMerchantKey({ userMerchant: s.merchant, merchantName: s.rawMerchant, name: s.name }))) {
      continue;
    }
    const month = date.slice(0, 7);
    if (s.internal) continue;
    const code = (s.category ?? "").toUpperCase();
    if (code === "INCOME" || code.startsWith("INCOME_") || s.amount < 0) {
      const src = incomeSourceLabel({
        name: s.name,
        merchantName: s.rawMerchant,
        userMerchant: s.merchant,
        categoryPrimary: s.category,
        accountName: s.accountName,
      });
      flows.push({
        id: s.plaidTransactionId,
        date,
        month,
        kind: "income",
        category: src,
        merchant: s.merchant || src,
        amount: Math.abs(s.amount),
      });
    } else if (s.amount > 0) {
      flows.push({
        id: s.plaidTransactionId,
        date,
        month,
        kind: "spend",
        category: categoryLabel(s.category),
        merchant: s.merchant,
        amount: s.amount,
      });
    }
  }
  for (const date of earliestByInstitution.values()) {
    if (!archiveCoversFrom || date > archiveCoversFrom) archiveCoversFrom = date;
  }

  return {
    flows,
    recurring: inferRecurring(txns, ignoredRecurring),
    archiveCoversFrom,
  };
}

export type InsightCard = {
  section: string;
  title: string;
  math: string;
  value: string;
  tone: "neutral" | "positive" | "negative";
};

/** Advisor-style ratios. Each card states its own arithmetic so the number is auditable at a glance. */
export async function getInsights(filter: OwnerFilter) {
  const now = new Date();
  const [cashflow, overview, reports, accounts] = await Promise.all([
    getCashflow(filter, now, false),
    getOverview(filter),
    getReports(filter),
    prisma.account.findMany({ include: { item: true } }),
  ]);
  const accs = accounts.filter((a) => matchesOwner(a.owner, filter));
  const cards: InsightCard[] = [];

  // --- Liquidity -------------------------------------------------------------
  cards.push({
    section: "Liquidity",
    title: "Emergency fund",
    math:
      cashflow.monthlyEssential > 0
        ? `${formatMath(cashflow.cash)} cash ÷ ${formatMath(cashflow.monthlyEssential)} essential spend / month (90-day average)`
        : "Need 90 days of rent, medical, loan, and transport charges to compute runway.",
    value: cashflow.runway != null ? `${cashflow.runway.toFixed(1)} mo` : "—",
    tone: cashflow.runway == null ? "neutral" : cashflow.runway < 3 ? "negative" : cashflow.runway >= 6 ? "positive" : "neutral",
  });

  if (cashflow.monthlyEssential > 0) {
    const target = cashflow.monthlyEssential * 6;
    const idle = cashflow.cash - target;
    cards.push({
      section: "Liquidity",
      title: idle >= 0 ? "Cash above a 6-month reserve" : "Shortfall to a 6-month reserve",
      math: `${formatMath(cashflow.cash)} cash − ${formatMath(target)} (6 × essential spend)`,
      value: formatMath(Math.abs(idle)),
      tone: idle >= 0 ? "neutral" : "negative",
    });
  }

  // --- Cash flow: last three complete months --------------------------------
  const months: string[] = [];
  for (let i = 1; i <= 3; i++) months.push(ymKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const window = reports.flows.filter((f) => months.includes(f.month));
  const income = window.filter((f) => f.kind === "income").reduce((s, f) => s + f.amount, 0);
  const spend = window.filter((f) => f.kind === "spend").reduce((s, f) => s + f.amount, 0);
  const invested = window.filter((f) => f.kind === "invest").reduce((s, f) => s + f.amount, 0);
  if (income > 0) {
    const rate = (income - spend) / income;
    cards.push({
      section: "Cash flow",
      title: "Savings rate, trailing 3 months",
      math: `(${formatMath(income)} income − ${formatMath(spend)} spending) ÷ ${formatMath(income)} income`,
      value: formatPctValue(rate),
      tone: rate < 0.1 ? "negative" : rate >= 0.2 ? "positive" : "neutral",
    });
    const housing = window
      .filter((f) => f.kind === "spend" && (f.category === "Loan payments" || f.category === "Rent and utilities"))
      .reduce((s, f) => s + f.amount, 0);
    if (housing > 0) {
      const share = housing / income;
      cards.push({
        section: "Cash flow",
        title: "Housing and debt service share of income",
        math: `${formatMath(housing)} loan, rent and utility payments ÷ ${formatMath(income)} income, trailing 3 months`,
        value: formatPctValue(share),
        tone: share > 0.36 ? "negative" : share <= 0.28 ? "positive" : "neutral",
      });
    }
    if (invested > 0) {
      cards.push({
        section: "Cash flow",
        title: "Share of income sent to investments",
        math: `${formatMath(invested)} transferred to brokerage or retirement ÷ ${formatMath(income)} income, trailing 3 months`,
        value: formatPctValue(invested / income),
        tone: "neutral",
      });
    }
    const monthly = months.map((m) => {
      const rows = reports.flows.filter((f) => f.month === m && f.kind === "spend");
      return rows.reduce((s, f) => s + f.amount, 0);
    });
    const avg = monthly.reduce((s, v) => s + v, 0) / monthly.length;
    const latest = monthly[0];
    if (avg > 0 && latest > 0) {
      const drift = (latest - avg) / avg;
      cards.push({
        section: "Cash flow",
        title: "Last month's spending vs 3-month average",
        math: `${formatMath(latest)} last month vs ${formatMath(avg)} average`,
        value: `${drift >= 0 ? "+" : "−"}${formatPctValue(Math.abs(drift))}`,
        tone: drift > 0.15 ? "negative" : drift < -0.05 ? "positive" : "neutral",
      });
    }
  }

  // --- Annual run-rate ---------------------------------------------------------
  // Plaid hands over ~90 days of deposits, so a year of take-home is inferred from paycheck cadence,
  // and a year of spending from the complete months on file.
  const pay = annualisedPaychecks(reports.flows);
  if (pay.annual > 0) {
    cards.push({
      section: "Annual run-rate",
      title: "Take-home pay, annualised",
      math: pay.sources
        .map((s) => `${s.label}: ${formatMath(s.amount)} ${s.cadence} × ${s.perYear}`)
        .join(" + "),
      value: formatMath(pay.annual),
      tone: "neutral",
    });
  }
  const run = annualisedSpend(reports.flows, now);
  if (run) {
    cards.push({
      section: "Annual run-rate",
      title: "Total spending, annualised",
      math: `${formatMath(run.total)} over ${run.basis} × ${run.factor}`,
      value: formatMath(run.total * run.factor),
      tone: "neutral",
    });
    cards.push({
      section: "Annual run-rate",
      title: "Discretionary spending, annualised",
      math: `${formatMath(run.discretionary)} excluding loan payments and rent & utilities, over ${run.basis} × ${run.factor}`,
      value: formatMath(run.discretionary * run.factor),
      tone: "neutral",
    });
  }

  // --- Balance sheet ----------------------------------------------------------
  const grossAssets = overview.netWorth + overview.tiles.liabilities;
  if (grossAssets > 0) {
    const ratio = overview.tiles.liabilities / grossAssets;
    cards.push({
      section: "Balance sheet",
      title: "Debt to assets",
      math: `${formatMath(overview.tiles.liabilities)} liabilities ÷ ${formatMath(grossAssets)} gross assets`,
      value: formatPctValue(ratio),
      tone: ratio > 0.5 ? "negative" : ratio <= 0.3 ? "positive" : "neutral",
    });
  }
  if (overview.monthChange != null && overview.netWorth > 0) {
    const pct = overview.monthChange / (overview.netWorth - overview.monthChange);
    cards.push({
      section: "Balance sheet",
      title: "Net worth change, 30 days",
      math: `${formatMath(overview.netWorth)} today vs ${formatMath(overview.netWorth - overview.monthChange)} a month ago`,
      value: `${overview.monthChange >= 0 ? "+" : "−"}${formatPctValue(Math.abs(pct))}`,
      tone: overview.monthChange >= 0 ? "positive" : "negative",
    });
  }
  const a = overview.allocation;
  const investable = a.stocks + a.crypto + a.retirement;
  if (overview.netWorth > 0 && a.retirement > 0) {
    cards.push({
      section: "Balance sheet",
      title: "Retirement share of net worth",
      math: `${formatMath(a.retirement)} in tax-advantaged accounts ÷ ${formatMath(overview.netWorth)} net worth`,
      value: formatPctValue(a.retirement / overview.netWorth),
      tone: "neutral",
    });
  }
  if (overview.netWorth > 0 && a.real_estate > 0) {
    cards.push({
      section: "Balance sheet",
      title: "Home equity share of net worth",
      math: `${formatMath(a.real_estate)} real-estate equity ÷ ${formatMath(overview.netWorth)} net worth`,
      value: formatPctValue(a.real_estate / overview.netWorth),
      tone: a.real_estate / overview.netWorth > 0.5 ? "negative" : "neutral",
    });
  }

  // --- Portfolio --------------------------------------------------------------
  if (investable > 0) {
    const top = [...overview.movers].sort((x, y) => Math.abs(y.value) - Math.abs(x.value))[0];
    if (top) {
      const weight = Math.abs(top.value) / investable;
      cards.push({
        section: "Portfolio",
        title: `Largest position: ${top.symbol ?? top.name}`,
        math: `${formatMath(Math.abs(top.value))} ÷ ${formatMath(investable)} invested`,
        value: formatPctValue(weight),
        tone: weight > 0.25 ? "negative" : "neutral",
      });
    }
    if (a.crypto > 0) {
      const share = a.crypto / investable;
      cards.push({
        section: "Portfolio",
        title: "Crypto share of invested assets",
        math: `${formatMath(a.crypto)} crypto ÷ ${formatMath(investable)} invested`,
        value: formatPctValue(share),
        tone: share > 0.2 ? "negative" : "neutral",
      });
    }
  }

  // --- Credit -----------------------------------------------------------------
  const cards_ = accs.filter((x) => x.hausType === "credit_card" && x.limitAmount && x.limitAmount > 0);
  if (cards_.length) {
    const used = cards_.reduce((s, x) => s + Math.abs(x.currentBalance ?? 0), 0);
    const limit = cards_.reduce((s, x) => s + (x.limitAmount ?? 0), 0);
    const util = used / limit;
    cards.push({
      section: "Credit",
      title: "Card utilization",
      math: `${formatMath(used)} balances ÷ ${formatMath(limit)} combined limits across ${cards_.length} card${cards_.length === 1 ? "" : "s"}`,
      value: formatPctValue(util),
      tone: util > 0.3 ? "negative" : util < 0.1 ? "positive" : "neutral",
    });
  }

  cards.push(...spendingBehavior(reports.flows, now));

  return { cards };
}

type Flow = { date: string; month: string; kind: "spend" | "income" | "invest"; category: string; merchant: string; amount: number };

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** True for employment take-home (salary / contractor). Excludes interest, rentals, credits. */
function isTakeHome(category: string) {
  const c = category.toLowerCase();
  return c.startsWith("income") && !c.includes("interest");
}

/**
 * Cluster deposits that land within ~20% of each other. One employer can pay two
 * fixed streams that look unstable if they are lumped together.
 */
function amountClusters(rows: { date: number; amount: number }[]) {
  const sorted = [...rows].sort((a, b) => a.amount - b.amount);
  const clusters: { date: number; amount: number }[][] = [];
  for (const row of sorted) {
    const last = clusters[clusters.length - 1];
    const pivot = last ? median(last.map((r) => r.amount)) : 0;
    if (last && pivot > 0 && Math.abs(row.amount - pivot) / pivot <= 0.2) last.push(row);
    else clusters.push([row]);
  }
  return clusters;
}

function cadenceOf(dates: number[]): { cadence: string; perYear: number } | null {
  if (dates.length < 3) return null;
  const sorted = [...dates].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / 86400000);
  const avg = gaps.reduce((s, x) => s + x, 0) / gaps.length;
  if (avg >= 6 && avg <= 8) return { cadence: "weekly", perYear: 52 };
  if (avg >= 13 && avg <= 15 && gaps.every((d) => d >= 12 && d <= 16)) return { cadence: "biweekly", perYear: 26 };
  if (avg >= 13 && avg <= 17) return { cadence: "semi-monthly", perYear: 24 };
  if (avg >= 26 && avg <= 35) return { cadence: "monthly", perYear: 12 };
  return null;
}

/** All holders' repeating take-home deposits, scaled to a year. Amount-clustered per merchant. */
export function annualisedPaychecks(flows: Flow[]) {
  const byMerchant = new Map<string, { label: string; rows: { date: number; amount: number }[] }>();
  for (const f of flows) {
    if (f.kind !== "income" || !isTakeHome(f.category)) continue;
    const key = recurringMerchantKey(f.merchant);
    if (!key) continue;
    const g = byMerchant.get(key) ?? { label: f.merchant, rows: [] };
    g.rows.push({ date: Date.parse(f.date), amount: f.amount });
    byMerchant.set(key, g);
  }
  const sources: { label: string; amount: number; cadence: string; perYear: number }[] = [];
  for (const g of byMerchant.values()) {
    for (const cluster of amountClusters(g.rows)) {
      // Drop one-off outliers (bonuses) that sit far from the cluster median.
      const med0 = median(cluster.map((r) => r.amount));
      const steady = cluster.filter((r) => med0 > 0 && Math.abs(r.amount - med0) / med0 <= 0.2);
      if (steady.length < 3) continue;
      const hit = cadenceOf(steady.map((r) => r.date));
      if (!hit) continue;
      const amount = median(steady.map((r) => r.amount));
      if (amount <= 0) continue;
      sources.push({ label: g.label, amount, cadence: hit.cadence, perYear: hit.perYear });
    }
  }
  sources.sort((a, b) => b.amount * b.perYear - a.amount * a.perYear);
  return { annual: sources.reduce((s, x) => s + x.amount * x.perYear, 0), sources };
}

const FIXED_SPEND = new Set(["Loan payments", "Rent and utilities"]);

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Personal-finance apps (Monarch, Copilot, YNAB) flag two things people actually act on:
 * a category or merchant running well above its own recent baseline, and the direction of
 * steerable spend from one complete month to the next. Fixed housing and debt service are
 * left out of the trend cards.
 */
function spendingBehavior(flows: Flow[], now: Date): InsightCard[] {
  const cards: InsightCard[] = [];
  const spend = flows.filter((f) => f.kind === "spend");
  if (!spend.length) return cards;
  const current = ymKey(now);
  const catMonth = new Map<string, Map<string, number>>();
  const merchMonth = new Map<string, Map<string, { label: string; amount: number }>>();
  for (const f of spend) {
    const cats = catMonth.get(f.month) ?? new Map<string, number>();
    cats.set(f.category, (cats.get(f.category) ?? 0) + f.amount);
    catMonth.set(f.month, cats);
    const key = recurringMerchantKey(f.merchant) || f.merchant.toLowerCase();
    const merchs = merchMonth.get(f.month) ?? new Map<string, { label: string; amount: number }>();
    const prev = merchs.get(key) ?? { label: f.merchant, amount: 0 };
    prev.amount += f.amount;
    merchs.set(key, prev);
    merchMonth.set(f.month, merchs);
  }
  const sumMonth = (m: string) => [...(catMonth.get(m)?.values() ?? [])].reduce((s, v) => s + v, 0);
  const months = [...catMonth.keys()].sort();
  const complete = months.filter((m) => m < current);
  const focusPartial = now.getDate() >= 7 && sumMonth(current) > 0;
  const focus = focusPartial ? current : complete[complete.length - 1];
  if (!focus) return cards;
  const baseline = complete.filter((m) => m !== focus).slice(-2);
  const scale = focusPartial ? daysInMonth(focus) / Math.max(1, now.getDate()) : 1;
  const lastFull = [...complete].reverse().find((m) => m !== focus) ?? complete[complete.length - 1];

  if (focusPartial && lastFull && sumMonth(lastFull) > 0) {
    const soFar = sumMonth(current);
    const projected = soFar * scale;
    const prior = sumMonth(lastFull);
    const drift = (projected - prior) / prior;
    cards.push({
      section: "Spending anomalies",
      title: "This month's spending pace",
      math: `${formatMath(soFar)} in ${now.getDate()} days, on pace for ${formatMath(projected)} vs ${formatMath(prior)} in ${monthLabel(lastFull)}`,
      value: `${drift >= 0 ? "+" : "−"}${formatPctValue(Math.abs(drift))}`,
      tone: drift > 0.15 ? "negative" : drift < -0.1 ? "positive" : "neutral",
    });
  }

  if (baseline.length) {
    const focusCats = catMonth.get(focus) ?? new Map<string, number>();
    const allCats = new Set<string>(focusCats.keys());
    for (const m of baseline) for (const c of catMonth.get(m)?.keys() ?? []) allCats.add(c);
    const spikes: { cat: string; raw: number; base: number }[] = [];
    for (const cat of allCats) {
      const raw = focusCats.get(cat) ?? 0;
      // A partial month is not scaled up. Rent and loan payments land once, and scaling them
      // makes a normal bill look like a spike. Flag only spend that has already beaten a full month.
      const baseVals = baseline.map((m) => catMonth.get(m)?.get(cat) ?? 0);
      const base = baseVals.reduce((s, v) => s + v, 0) / baseVals.length;
      const hot = focusPartial ? raw > base * 1.15 : raw > base * 1.4;
      if (base <= 0 || !hot) continue;
      const monthSpend = sumMonth(focus);
      if (monthSpend <= 0 || raw / monthSpend < 0.05) continue;
      spikes.push({ cat, raw, base });
    }
    spikes.sort((a, b) => b.raw - b.base - (a.raw - a.base));
    for (const s of spikes.slice(0, 3)) {
      cards.push({
        section: "Spending anomalies",
        title: `${s.cat} is running hot`,
        math: focusPartial
          ? `${formatMath(s.raw)} so far this month vs ${formatMath(s.base)} in a typical recent full month`
          : `${formatMath(s.raw)} in ${monthLabel(focus)} vs ${formatMath(s.base)} over the prior ${baseline.length} month${baseline.length === 1 ? "" : "s"}`,
        value: `+${formatPctValue((s.raw - s.base) / s.base)}`,
        tone: "negative",
      });
    }

    const focusMerch = merchMonth.get(focus) ?? new Map<string, { label: string; amount: number }>();
    const merchSpikes: { label: string; raw: number; base: number; projected: number }[] = [];
    for (const [key, row] of focusMerch) {
      const baseVals = baseline.map((m) => merchMonth.get(m)?.get(key)?.amount ?? 0).filter((v) => v > 0);
      if (!baseVals.length) continue;
      const base = baseVals.reduce((s, v) => s + v, 0) / baseVals.length;
      const compared = row.amount;
      const hot = focusPartial ? compared > base * 1.5 : compared > base * 2;
      if (base <= 0 || !hot) continue;
      merchSpikes.push({ label: row.label, raw: row.amount, base, projected: compared });
    }
    merchSpikes.sort((a, b) => b.projected - b.base - (a.projected - a.base));
    for (const s of merchSpikes.slice(0, 2)) {
      cards.push({
        section: "Spending anomalies",
        title: `${s.label} is above its usual`,
        math: focusPartial
          ? `${formatMath(s.raw)} so far vs ${formatMath(s.base)} in a typical recent month`
          : `${formatMath(s.raw)} in ${monthLabel(focus)} vs ${formatMath(s.base)} in a typical recent month`,
        value: `+${formatPctValue((s.projected - s.base) / s.base)}`,
        tone: "negative",
      });
    }
  }

  if (complete.length >= 2) {
    const newer = complete[complete.length - 1];
    const older = complete[complete.length - 2];
    const cats = new Set<string>([...(catMonth.get(newer)?.keys() ?? []), ...(catMonth.get(older)?.keys() ?? [])]);
    const moves: { cat: string; newerAmt: number; olderAmt: number; drift: number }[] = [];
    for (const cat of cats) {
      if (FIXED_SPEND.has(cat)) continue;
      const newerAmt = catMonth.get(newer)?.get(cat) ?? 0;
      const olderAmt = catMonth.get(older)?.get(cat) ?? 0;
      if (newerAmt <= 0 || olderAmt <= 0) continue;
      const drift = (newerAmt - olderAmt) / olderAmt;
      if (Math.abs(drift) < 0.2) continue;
      moves.push({ cat, newerAmt, olderAmt, drift });
    }
    const rising = moves.filter((m) => m.drift > 0).sort((a, b) => b.drift - a.drift).slice(0, 2);
    const falling = moves.filter((m) => m.drift < 0).sort((a, b) => a.drift - b.drift).slice(0, 2);
    for (const m of rising) {
      cards.push({
        section: "Spending trends",
        title: `${m.cat} is rising`,
        math: `${formatMath(m.newerAmt)} in ${monthLabel(newer)} vs ${formatMath(m.olderAmt)} in ${monthLabel(older)}`,
        value: `+${formatPctValue(m.drift)}`,
        tone: "negative",
      });
    }
    for (const m of falling) {
      cards.push({
        section: "Spending trends",
        title: `${m.cat} is falling`,
        math: `${formatMath(m.newerAmt)} in ${monthLabel(newer)} vs ${formatMath(m.olderAmt)} in ${monthLabel(older)}`,
        value: `−${formatPctValue(Math.abs(m.drift))}`,
        tone: "positive",
      });
    }
    const share = (m: string) => {
      let total = 0;
      let discretionary = 0;
      for (const [cat, v] of catMonth.get(m) ?? []) {
        total += v;
        if (!FIXED_SPEND.has(cat)) discretionary += v;
      }
      return total > 0 ? discretionary / total : null;
    };
    const dNew = share(newer);
    const dOld = share(older);
    if (dNew != null && dOld != null) {
      const drift = dNew - dOld;
      cards.push({
        section: "Spending trends",
        title: "Discretionary share of spending",
        math: `${formatPctValue(dNew)} in ${monthLabel(newer)} vs ${formatPctValue(dOld)} in ${monthLabel(older)}, excluding loan payments and rent & utilities`,
        value: `${drift >= 0 ? "+" : "−"}${formatPctValue(Math.abs(drift))}`,
        tone: drift > 0.05 ? "negative" : drift < -0.05 ? "positive" : "neutral",
      });
    }
  }

  return cards;
}

/** Spend over the most recent complete months, with the factor that scales it to a year.
 *  Capped at three because Plaid's initial pull covers ~90 days; older months are usually thin. */
export function annualisedSpend(flows: Flow[], now: Date) {
  const current = ymKey(now);
  const spend = flows.filter((f) => f.kind === "spend");
  const months = [...new Set(spend.map((f) => f.month))].filter((m) => m < current).sort().slice(-3);
  if (months.length === 0) {
    // Only the current month so far: scale by the days elapsed.
    const days = Math.max(1, now.getDate());
    const rows = spend.filter((f) => f.month === current);
    if (rows.length === 0) return null;
    const total = rows.reduce((s, f) => s + f.amount, 0);
    const discretionary = rows.filter((f) => !FIXED_SPEND.has(f.category)).reduce((s, f) => s + f.amount, 0);
    return { total, discretionary, basis: `${days} days`, factor: Math.round((365 / days) * 10) / 10 };
  }
  const set = new Set(months);
  const rows = spend.filter((f) => set.has(f.month));
  const total = rows.reduce((s, f) => s + f.amount, 0);
  const discretionary = rows.filter((f) => !FIXED_SPEND.has(f.category)).reduce((s, f) => s + f.amount, 0);
  const n = months.length;
  return {
    total,
    discretionary,
    basis: `${n} complete month${n === 1 ? "" : "s"}`,
    factor: Math.round((12 / n) * 100) / 100,
  };
}

function formatMath(n: number) {
  return formatMoney(n);
}

function formatPctValue(ratio: number) {
  const pct = ratio * 100;
  return `${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;
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
