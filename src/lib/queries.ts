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
import {
  FIXED_USD_ID,
  IRS_LIMITS,
  IRS_LIMITS_YEAR,
  PFC_LABELS,
  categoryLabel,
  incomeSourceLabel,
  savedUserCategory,
} from "./constants";
import { REFUNDS } from "./flow-labels";
import { loadCardPaymentFlags } from "./card-payments";
import { effectiveCategory, isInternalMove, isInvestFunding, isTransferCategory, recurringMerchantKey, txnMerchantKey } from "./categories";
import { dayKey, ymKey } from "./range";
import { plaidIdsOnLedger, savedChargeCounted, savedOwnerNow } from "./report-archive";

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
import { ellipsize, formatHoldingClass, startOfDay } from "./format";
import { differenceInCalendarDays, subDays } from "date-fns";
import { accountLabel, withoutInstitution } from "./account-label";
import { reconstructNetWorthPath, type PathPoint } from "./history";
import { coinGeckoId, cryptoSpanMoves, ensurePriceHistory, equityDayMoves, historyAgreesWithSpot, isOptionSymbol, loadPriceMap, optionPremiumScale, priceOnOrBefore, quoteSymbol, RECENT_CLOSE_DAYS } from "./quotes";
import { closeDaysAgo } from "./price-window";
import { propertyDebt, vehicleDebt } from "./property";
import { loadCryptoLots, lotValue } from "./crypto-lots";
import type { BrandKind } from "./logos";
import { buildAttention } from "./attention";
import { inferRecurring } from "./recurring";
import { readRecurringMarks } from "./recurring-marks";
export { inferRecurring };
import { listBudgets } from "./budgets";
import { buildInsights, rankInsights, topActions, type Debt } from "./insights";
import { readProjectionPrefs } from "./projection-prefs";
import { PLAN_DEFAULTS, estimateSaving, mergeChildren, retirementSnapshot } from "./retirement-snapshot";
import { EQUITY_ID_PREFIX, ESPP_LABEL, VEST_LABEL, dedupeEspp, equityKind, equityKindOfCategory, trailingYear, type EquityEvent } from "./equity-comp";
import { realReturn } from "./retirement-plan";
import { mustPayMonthly } from "./emergency-fund";
import { readShowGoals } from "./goals";
import {
  OUTSIDE_DEPOSIT_LABEL,
  RETIREMENT_CONTRIBUTION_LABEL,
  type RetirementDeposit,
  isBrokerageDeposit,
  isContributionBuy,
  retirementDepositKind,
  retirementInflows,
  unmatchedDeposits,
} from "./outside-deposits";
import type { FlowRow } from "./spend-net";

/** One deposit into a retirement account. */
export type ContributionRow = { id: string; date: string; amount: number; label: string; fromPay: boolean };

export async function getNames() {
  const showGoals = await readShowGoals();
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
      goals: showGoals,
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
  let path: PathPoint[] = snapshots.map((s) => ({
    date: s.date.toISOString(),
    netWorth: s.netWorth,
    assets: s.netWorth + s.liabilities,
    liabilities: s.liabilities,
  }));
  try {
    const reconstructed = await reconstructNetWorthPath(filter);
    if (reconstructed.length >= 2) path = reconstructed;
  } catch {
    /* keep stored snapshots */
  }

  const dayMoves = await equityDayMoves(
    valuedHolds
      .filter((x) => x.h.quoteChange == null && x.h.symbol && !isCryptoHoldingType(x.h.type))
      .map((x) => x.h.symbol as string),
  );
  try {
    await ensurePriceHistory(
      historyNeed
        .filter((s) => s.kind === "equity")
        .map((s) => {
          const live = dayMoves.get(quoteSymbol(s.symbol));
          return live && live.price > 0 ? { ...s, spot: live.price } : s;
        }),
      historyFrom,
      now,
    );
  } catch {
    /* week and month moves use whatever bars are already stored */
  }

  const moverSymbols = [...new Set(historyNeed.map((s) => s.symbol))];
  const spanIds = [
    ...valuedHolds
      .filter((x) => isCryptoHoldingType(x.h.type))
      .map((x) => coinGeckoId(x.h.symbol, null)),
    ...valuedCoins.map((x) => coinGeckoId(x.c.symbol, x.c.coingeckoId)),
  ].filter((id): id is string => Boolean(id));
  const [priceMap, spans] = await Promise.all([
    moverSymbols.length ? loadPriceMap(moverSymbols, historyFrom, now) : Promise.resolve(new Map<string, number>()),
    cryptoSpanMoves(spanIds),
  ]);

  function moveFromPct(last: number | null, qty: number, pct: number | null) {
    if (last == null || !(last > 0) || qty === 0 || pct == null || !Number.isFinite(pct) || pct <= -100) {
      return { delta: null as number | null, pct: null as number | null };
    }
    const then = last / (1 + pct / 100);
    if (!(then > 0)) return { delta: null, pct: null };
    return { delta: (last - then) * qty, pct };
  }

  function cryptoWindow(symbol: string | null, gecko: string | null | undefined, last: number | null, qty: number, days: 7 | 30) {
    const span = spans.get(coinGeckoId(symbol, gecko) ?? "");
    const pct = days === 7 ? span?.weekPct : span?.monthPct;
    // No stored daily series here. A stock chart saved under the same ticker was showing up as a coin move.
    if (pct == null) return { delta: null as number | null, pct: null as number | null };
    return moveFromPct(last, qty, pct);
  }

  function periodMove(symbol: string | null, qty: number, last: number | null, days: number) {
    if (!symbol || last == null || last <= 0 || qty === 0) return { delta: null as number | null, pct: null as number | null };
    const key = symbol.toUpperCase();
    const recent = priceOnOrBefore(priceMap, key, now, RECENT_CLOSE_DAYS);
    if (recent != null && !historyAgreesWithSpot(recent, last)) return { delta: null, pct: null };
    const then = closeDaysAgo(priceMap, key, now, days);
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

  const movers = [
    ...valuedHolds.map(({ h, value, last }) => {
      const live = h.symbol ? dayMoves.get(quoteSymbol(h.symbol)) : undefined;
      const scale =
        h.symbol && live && isOptionSymbol(h.symbol)
          ? optionPremiumScale(h.institutionPrice ?? h.quotePrice, live.price)
          : 1;
      // Week and month use the same live price as the day move. The brokerage price can sit on an old sync.
      const quoted = live && live.price > 0 ? live.price : last;
      const hist1 = periodMove(h.symbol, h.quantity * scale, quoted, 1);
      const dayDelta =
        h.quoteChange != null ? h.quoteChange * h.quantity : live ? live.change * scale * h.quantity : hist1.delta;
      const dayPct = h.quoteChangePct ?? live?.changePct ?? hist1.pct;
      const crypto = isCryptoHoldingType(h.type);
      return {
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        kind: (crypto ? "crypto" : "security") as "crypto" | "security",
        retirement: isRetirementAccount(h.account),
        value,
        day: { delta: dayDelta, pct: dayPct },
        week: crypto ? cryptoWindow(h.symbol, null, last, h.quantity, 7) : periodMove(h.symbol, h.quantity * scale, quoted, 7),
        month: crypto ? cryptoWindow(h.symbol, null, last, h.quantity, 30) : periodMove(h.symbol, h.quantity * scale, quoted, 30),
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
        week: cryptoWindow(c.symbol, c.coingeckoId, last, c.quantity, 7),
        month: cryptoWindow(c.symbol, c.coingeckoId, last, c.quantity, 30),
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
      /** Vehicles and other balances that are not cash, investments, or debt. */
      otherAssets,
      insurance: { policies: pols.length, lifeCoverage, liabilityCoverage },
    },
    allocation,
    allocationItems,
    path,
    moved: { accounts: movedAccounts, transactions: largeTxns, holdings: holdingMoves },
  };
}

/** Things on Overview that need a look: broken links, overspent budgets, odd charges, renewals. */
export async function getAttention(flows: FlowRow[]) {
  const names = await getNames();
  const [items, cards, wallets, budgets, policies] = await Promise.all([
    prisma.plaidItem.findMany({
      select: { id: true, institutionName: true, status: true, errorMessage: true, lastSyncedAt: true },
    }),
    prisma.account.findMany({ where: { hausType: "credit_card" }, include: { item: true } }),
    names.tabs.crypto
      ? prisma.cryptoWallet.findMany({ select: { id: true, label: true, address: true, lastError: true } })
      : Promise.resolve([]),
    listBudgets(),
    names.tabs.insurance
      ? prisma.insurancePolicy.findMany({ select: { id: true, type: true, carrier: true, renewalDate: true } })
      : Promise.resolve([]),
  ]);
  return buildAttention({
    items,
    cards: cards.map((a) => ({
      id: a.id,
      name: accountLabel(a.name, a.item.institutionName),
      balance: a.currentBalance,
      limit: a.limitAmount,
    })),
    wallets,
    flows,
    budgets,
    policies,
  });
}

export async function getAccountsForFilter(filter: OwnerFilter) {
  const accounts = await prisma.account.findMany({ include: { item: true } });
  return accounts.filter((a) => matchesOwner(a.owner, filter));
}

export async function getCashflow(filter: OwnerFilter, month: Date, includeTransfers: boolean) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const lookbackStart = subDays(start, 400);

  const [txns, hidden, ignoredRecurring, marks] = await Promise.all([
    prisma.txn.findMany({
      where: { date: { gte: lookbackStart, lt: end } },
      include: { account: true },
      orderBy: { date: "asc" },
    }),
    hiddenMerchantKeys(),
    ignoredRecurringKeys(),
    readRecurringMarks(),
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

  const recurring = inferRecurring(scoped.filter((t) => t.date < end), ignoredRecurring, new Date(), marks);

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
    trades,
    hasQuotes: scoped.some((h) => h.quotePrice != null),
  };
}

/** Cash events from the last 13 months in non-retirement brokerage accounts, for the dividend summary. */
export async function getDividendTxns(filter: OwnerFilter) {
  const since = new Date();
  since.setMonth(since.getMonth() - 13);
  const rows = await prisma.investmentTxn.findMany({
    where: { date: { gte: since } },
    include: { account: true, security: true },
  });
  return rows
    .filter(
      (t) =>
        matchesOwner(t.account.owner, filter) &&
        !isRetirementAccount(t.account) &&
        !isCryptoHoldingType(t.security?.type),
    )
    .map((t) => ({ date: t.date.toISOString(), type: t.type, subtype: t.subtype, name: t.name, amount: t.amount }));
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
  const [prices, investments] = await Promise.all([
    prisma.pricePoint.findMany({ where: { symbol: upper }, orderBy: { date: "asc" }, select: { date: true, close: true } }),
    getInvestments(filter),
  ]);
  const manualValue = (m: (typeof investments.manuals)[number]) =>
    m.coingeckoId === FIXED_USD_ID ? (m.quotePrice ?? 0) : (m.quotePrice ?? 0) * m.quantity;
  const stocksTotal =
    investments.rows.reduce((s, r) => s + r.value, 0) + investments.manuals.reduce((s, m) => s + manualValue(m), 0);
  // Only what the Stocks page counts (no retirement lots), so the share matches that page.
  const stocksValue =
    investments.rows.filter((r) => r.symbol?.toUpperCase() === upper).reduce((s, r) => s + r.value, 0) +
    investments.manuals
      .filter((m) => m.coingeckoId !== FIXED_USD_ID && m.symbol.toUpperCase() === upper)
      .reduce((s, m) => s + manualValue(m), 0);
  return {
    names,
    symbol,
    lots,
    trades,
    prices: prices.map((p) => ({ date: p.date.toISOString(), close: p.close })),
    stocksShare: stocksTotal > 0 && stocksValue > 0 ? stocksValue / stocksTotal : null,
  };
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
    const countsAsContribution = (t: (typeof a.investmentTxns)[number]) => {
      const sub = (t.subtype || "").toLowerCase();
      const type = (t.type || "").toLowerCase();
      return sub.includes("contribution") || (type === "cash" && sub.includes("deposit")) || sub.includes("transfer");
    };
    const ytd = a.investmentTxns
      .filter((t) => t.date >= yStart && t.date < yEnd)
      .filter(countsAsContribution)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    // Every deposit into the account, newest first: what the cash flow chart counts, plus what this year's total counts.
    const planPays = a.investmentTxns.some((t) => retirementDepositKind(t) === "payroll");
    const contributions: ContributionRow[] = a.investmentTxns
      .flatMap((t) => {
        const found = retirementDepositKind(t) ?? (!planPays && isContributionBuy(t) ? "payroll" : null);
        // Whatever this year's total counts is listed too, so the list always adds up to it.
        if (!found && !countsAsContribution(t)) return [];
        return [{ id: t.id, date: dayKey(t.date), amount: Math.abs(t.amount), label: t.name, fromPay: found === "payroll" }];
      })
      .sort((x, y) => y.date.localeCompare(x.date));
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
      contributions,
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
      contributions: [] as ContributionRow[],
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

/**
 * RSU vests and ESPP purchases in the linked brokerages. Live rows come from the investment feed;
 * saved copies (when transaction history is kept) fill in after an account is unlinked.
 */
export async function getEquityComp(filter: OwnerFilter, now = new Date()) {
  const [live, saved, accounts, firstLive] = await Promise.all([
    prisma.investmentTxn.findMany({
      where: { type: { notIn: ["sell", "cash", "fee", "cancel"] } },
      include: { account: { select: { owner: true } }, security: { select: { name: true, symbol: true } } },
    }),
    prisma.savedTxn.findMany({ where: { plaidTransactionId: { startsWith: EQUITY_ID_PREFIX } } }),
    prisma.account.findMany({ select: { id: true, owner: true } }),
    prisma.investmentTxn.aggregate({ _min: { date: true } }),
  ]);
  const ownerByAccount = new Map(accounts.map((a) => [a.id, a.owner]));
  const events: EquityEvent[] = [];
  const liveIds = new Set<string>();
  for (const t of live) {
    liveIds.add(EQUITY_ID_PREFIX + t.plaidInvestmentTxnId);
    const kind = equityKind(t);
    if (!kind || !matchesOwner(t.account.owner, filter)) continue;
    events.push({
      id: EQUITY_ID_PREFIX + t.plaidInvestmentTxnId,
      date: dayKey(t.date),
      kind,
      amount: Math.abs(t.amount),
      security: t.security?.name || t.security?.symbol || "Company stock",
      detail: t.name,
    });
  }
  let dataStart = firstLive._min.date ? dayKey(firstLive._min.date) : null;
  for (const s of saved) {
    const day = dayKey(s.date);
    if (!dataStart || day < dataStart) dataStart = day;
    const kind = equityKindOfCategory(s.category);
    if (!kind || liveIds.has(s.plaidTransactionId) || !matchesOwner(savedOwnerNow(s, ownerByAccount), filter)) continue;
    events.push({ id: s.plaidTransactionId, date: day, kind, amount: Math.abs(s.amount), security: s.rawMerchant || "Company stock", detail: s.name });
  }
  const kept = dedupeEspp(events).sort((a, b) => b.date.localeCompare(a.date));
  return {
    events: kept,
    vests: trailingYear(kept, "vest", now, dataStart),
    espp: trailingYear(kept, "espp", now, dataStart),
  };
}

/**
 * What money coming in is called in the cash flow. Pay, interest and other income keep their source. Money back
 * from a shop (a return, a credit, a waived fee) is one "Refunds" source, never an income named after the shop.
 */
function inflowLabel(code: string, source: string) {
  const c = code.toUpperCase();
  // A transfer in that no linked account sent: one plain source, not the bank's category code spelled out.
  if (c.startsWith("TRANSFER_IN") || /^transfer in\b/i.test(source)) return "Transfers in";
  const income = c === "INCOME" || c.startsWith("INCOME_");
  if (income || source === "Interest" || /cash.?back|rewards|rebate/i.test(source)) return source;
  return REFUNDS;
}

export async function getReports(filter: OwnerFilter) {
  const [visible, ignoredRecurring, marks, hidden, ledgerIds, accountOwners] = await Promise.all([
    loadVisibleTxns(filter),
    ignoredRecurringKeys(),
    readRecurringMarks(),
    hiddenMerchantKeys(),
    prisma.txn.findMany({ select: { plaidTransactionId: true } }),
    prisma.account.findMany({ select: { id: true, owner: true } }),
  ]);
  const txns = visible;
  // Every ledger id, including accounts outside this filter. The saved copy is
  // only a stand-in after Plaid removes the row.
  const livePlaid = plaidIdsOnLedger(ledgerIds);
  const ownerByAccount = new Map(accountOwners.map((account) => [account.id, account.owner]));

  const flows: FlowRow[] = [];

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
      const src = inflowLabel(cat, incomeSourceLabel({ ...t, accountName: t.account.name }));
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

  const equity = await getEquityComp(filter);
  for (const e of equity.events) {
    const month = e.date.slice(0, 7);
    if (e.kind === "vest") {
      flows.push({ id: e.id, date: e.date, month, kind: "income", category: VEST_LABEL, merchant: `${VEST_LABEL}: ${e.security}`, detail: e.detail, amount: e.amount });
      continue;
    }
    // An ESPP purchase is paid for out of pay before take-home, and lands in the brokerage as shares.
    const merchant = `ESPP: ${e.security}`;
    flows.push({ id: e.id, date: e.date, month, kind: "income", category: ESPP_LABEL, merchant, detail: e.detail, amount: e.amount });
    flows.push({ id: `espp-invest:${e.id}`, date: e.date, month, kind: "invest", category: "To investments", merchant, detail: e.detail, amount: e.amount });
  }

  // 401(k), 403(b), and HSA money taken from pay, and any other retirement deposit no linked account explains.
  // One "Retirement accounts" source; its window lists each account by the name the Retirement tab uses, with its bank's logo.
  for (const d of await retirementContributions(filter)) {
    const month = d.date.slice(0, 7);
    const merchant = d.institution;
    flows.push({ id: `retire:${d.id}`, date: d.date, month, kind: "income", category: RETIREMENT_CONTRIBUTION_LABEL, merchant, logo: d.logo, detail: d.detail, amount: d.amount });
    flows.push({ id: `retire-invest:${d.id}`, date: d.date, month, kind: "invest", category: "To investments", merchant, logo: d.logo, detail: d.detail, amount: d.amount });
  }

  // Cash arriving in a brokerage with nothing leaving a linked account to match it came from an account Haus
  // can't see. It is income, and it goes straight to investments.
  for (const d of await outsideBrokerageDeposits(filter)) {
    const merchant = `${d.institution} deposit`;
    flows.push({ id: `outside:${d.id}`, date: d.date, month: d.date.slice(0, 7), kind: "income", category: OUTSIDE_DEPOSIT_LABEL, merchant, amount: d.amount });
    flows.push({ id: `outside-invest:${d.id}`, date: d.date, month: d.date.slice(0, 7), kind: "invest", category: "To investments", merchant, amount: d.amount });
  }

  // Older months Plaid no longer returns stay in the month table via the saved copy.
  const archived = await prisma.savedTxn.findMany({ orderBy: { date: "desc" } });
  // A month is only complete once every saved institution reaches it. The binding date is the
  // latest of the per-institution earliest days (a ~90-day card window starts later than a bank
  // that already had years on this machine).
  const earliestByInstitution = new Map<string, string>();
  let archiveCoversFrom: string | null = null;
  const savedCharges: Parameters<typeof inferRecurring>[0] = [];
  for (const s of archived) {
    // Vests and ESPP purchases are read by getEquityComp above.
    if (s.plaidTransactionId.startsWith(EQUITY_ID_PREFIX)) continue;
    const owner = savedOwnerNow(s, ownerByAccount);
    if (!matchesOwner(owner, filter)) continue;
    const date = dayKey(s.date);
    const inst = s.institutionName || s.accountName || "account";
    const prev = earliestByInstitution.get(inst);
    if (!prev || date < prev) earliestByInstitution.set(inst, date);
    if (!savedChargeCounted({ ...s, owner }, livePlaid, filter)) continue;
    if (hidden.has(txnMerchantKey({ userMerchant: s.merchant, merchantName: s.rawMerchant, name: s.name }))) {
      continue;
    }
    const month = date.slice(0, 7);
    if (s.internal) continue;
    // Bills need their history: a yearly or every-two-months charge is often older than what the bank still returns.
    savedCharges.push({
      userMerchant: s.merchant,
      merchantName: s.rawMerchant,
      name: s.name,
      amount: s.amount,
      date: s.date,
      isTransfer: s.isTransfer,
      isCcPayment: s.isCcPayment,
      categoryPrimary: s.category,
      categoryDetailed: s.categoryDetailed,
    });
    const code = (s.category ?? "").toUpperCase();
    if (code === "INCOME" || code.startsWith("INCOME_") || s.amount < 0) {
      // The detailed category is what names a paycheck "Salary"; without it an old paycheck showed as its bank's name.
      const src = inflowLabel(
        code,
        incomeSourceLabel({
          name: s.name,
          merchantName: s.rawMerchant,
          userMerchant: s.merchant,
          categoryPrimary: s.category,
          categoryDetailed: s.categoryDetailed,
          userCategory: savedUserCategory(s.category, s.categoryDetailed),
          accountName: s.accountName,
        }),
      );
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
    recurring: inferRecurring([...txns, ...savedCharges], ignoredRecurring, new Date(), marks),
    // Restore removed brings back only what would be listed again: bills the app detects that were removed with the X.
    removedRecurring: ignoredRecurring.size
      ? new Set(
          inferRecurring([...txns, ...savedCharges], new Set(), new Date(), marks)
            .map((b) => recurringMerchantKey(b.label))
            .filter((key) => ignoredRecurring.has(key)),
        ).size
      : 0,
    archiveCoversFrom,
  };
}

/** Brokerage deposits in this filter that no outflow from another linked account explains. */
async function outsideBrokerageDeposits(filter: OwnerFilter) {
  const rows = await prisma.investmentTxn.findMany({
    where: { amount: { lt: 0 }, type: { in: ["transfer", "cash"] } },
    include: { account: { include: { item: true } } },
  });
  // Retirement and child accounts are left out: what goes into them is already counted as a contribution.
  const deposits = rows
    .filter(
      (t) =>
        matchesOwner(t.account.owner, filter) &&
        !isRetirementAccount(t.account) &&
        !isChildAccountType(t.account.hausType) &&
        isBrokerageDeposit(t),
    )
    .map((t) => ({
      id: t.id,
      date: dayKey(t.date),
      amount: Math.abs(t.amount),
      accountId: t.accountId,
      institution: t.account.item.institutionName ?? "Brokerage",
    }));
  if (!deposits.length) return [];
  const { outflows, coveredFrom } = await linkedOutflows();
  const judged = deposits.filter((d) => coveredFrom && d.date >= addDaysIso(coveredFrom, 5));
  return unmatchedDeposits(judged, outflows);
}

/**
 * New money in retirement accounts that no linked account shows leaving. Payroll contributions (the plan's
 * own wording) always count, since pay never passes through a bank on its way in. Plain deposits count only
 * once every linked bank's history reaches them, like brokerage deposits.
 */
async function retirementContributions(filter: OwnerFilter): Promise<RetirementDeposit[]> {
  const rows = await prisma.investmentTxn.findMany({
    where: { type: { in: ["cash", "transfer", "buy"] } },
    include: { account: { include: { item: true } }, security: { select: { name: true, symbol: true } } },
  });
  const mine = rows.filter(
    (t) => matchesOwner(t.account.owner, filter) && isRetirementAccount(t.account) && !isChildAccountType(t.account.hausType),
  );
  const withCash = new Set(mine.filter((t) => retirementDepositKind(t) === "payroll").map((t) => t.accountId));
  const payroll: RetirementDeposit[] = [];
  const plain: RetirementDeposit[] = [];
  for (const t of mine) {
    const kind = retirementDepositKind(t) ?? (!withCash.has(t.accountId) && isContributionBuy(t) ? "payroll" : null);
    if (!kind) continue;
    const institution = accountLabel(t.account.name, t.account.item.institutionName);
    const d = { id: t.id, date: dayKey(t.date), amount: Math.abs(t.amount), accountId: t.accountId, institution, logo: t.account.item.institutionName ?? undefined, detail: depositDetail(t) };
    (kind === "payroll" ? payroll : plain).push(d);
  }
  if (!payroll.length && !plain.length) return [];
  const { outflows, coveredFrom } = await linkedOutflows();
  const judged = plain.filter((d) => coveredFrom && d.date >= addDaysIso(coveredFrom, 5));
  return retirementInflows(payroll, judged, outflows);
}

/** The fund the contribution bought, or the plan's own wording when no fund is named. */
function depositDetail(t: { name: string; security: { name: string | null; symbol: string | null } | null }) {
  const security = t.security?.name || t.security?.symbol;
  const name = t.name.replace(/\s*\(cash\)\s*$/i, "").trim();
  if (!security) return name;
  // Plaid splits one purchase into two records, so the security name repeats the fund the transaction already names.
  const head = name.split(/\s[-–—]\s/)[0];
  if (head.length > 3 && security.toLowerCase().includes(head.toLowerCase())) return name;
  return `${security} — ${name}`;
}

/**
 * Money leaving any linked account, whoever owns it (a transfer between spouses is still internal): bank and card
 * debits, saved copies of them, and cash sent out of investment accounts (an IRA converted to a Roth). With it,
 * the first day every linked bank's history covers; before that a missing match proves nothing.
 */
async function linkedOutflows() {
  const [live, saved, invested] = await Promise.all([
    prisma.txn.findMany({ where: { amount: { gt: 0 } }, select: { date: true, amount: true, accountId: true, account: { select: { itemId: true } } } }),
    prisma.savedTxn.findMany({ where: { amount: { gt: 0 } }, select: { date: true, amount: true, accountId: true, institutionName: true } }),
    prisma.investmentTxn.findMany({
      where: { amount: { gt: 0 }, type: { in: ["cash", "transfer"] } },
      select: { date: true, amount: true, accountId: true },
    }),
  ]);
  const earliest = new Map<string, string>();
  const note = (key: string, day: string) => {
    const prev = earliest.get(key);
    if (!prev || day < prev) earliest.set(key, day);
  };
  for (const t of live) note(t.account.itemId, dayKey(t.date));
  for (const s of saved) if (s.institutionName) note(`saved:${s.institutionName}`, dayKey(s.date));
  const coveredFrom = [...earliest.values()].reduce((m, d) => (d > m ? d : m), "");
  const outflows = [
    ...live.map((o) => ({ date: dayKey(o.date), amount: o.amount, accountId: o.accountId })),
    ...saved.map((o) => ({ date: dayKey(o.date), amount: o.amount, accountId: o.accountId ?? "" })),
    ...invested.map((o) => ({ date: dayKey(o.date), amount: o.amount, accountId: o.accountId })),
  ];
  return { outflows, coveredFrom };
}

const BOND_NAME = /\b(bond|treasur|fixed income|t-bill|municipal|aggregate)/i;

/** A planner's checkup of the household, each measure against a common rule of thumb. */
export async function getInsights(filter: OwnerFilter) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [cashflow, overview, reports, equity, accounts, names, prefs, retirementData, holdings, manualStocks, snapshots, properties] =
    await Promise.all([
      getCashflow(filter, now, false),
      getOverview(filter),
      getReports(filter),
      getEquityComp(filter, now),
      prisma.account.findMany({ include: { item: true } }),
      getNames(),
      readProjectionPrefs(),
      getRetirement(filter),
      prisma.holding.findMany({ include: { account: true } }),
      prisma.manualHolding.findMany({ where: { kind: "security" } }),
      prisma.netWorthSnapshot.findMany({ where: { ownerKey: filter }, orderBy: { date: "asc" } }),
      prisma.property.findMany(),
    ]);
  const accs = accounts.filter((a) => matchesOwner(a.owner, filter));

  // Trailing three complete months.
  const months: string[] = [];
  for (let i = 1; i <= 3; i++) months.push(ymKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const window = reports.flows.filter((f) => months.includes(f.month));
  // Vests and ESPP purchases land in lumps, so they count at their 12-month average instead of in the month they land.
  const vests3 = equity.vests.monthly * 3;
  const espp3 = equity.espp.monthly * 3;
  const income3 =
    window.filter((f) => f.kind === "income" && f.category !== VEST_LABEL && f.category !== ESPP_LABEL).reduce((s, f) => s + f.amount, 0) +
    vests3 +
    espp3;
  const payroll3 = window.filter((f) => f.kind === "income" && f.category === RETIREMENT_CONTRIBUTION_LABEL).reduce((s, f) => s + f.amount, 0);
  const spend3 = window.filter((f) => f.kind === "spend").reduce((s, f) => s + f.amount, 0);
  const housing3 = window.filter((f) => f.kind === "spend" && FIXED_SPEND.has(f.category)).reduce((s, f) => s + f.amount, 0);
  const pay = annualisedPaychecks(reports.flows);
  const run = annualisedSpend(reports.flows, now);

  // Cash and what it earns.
  const cashAccs = accs.filter((a) => isCashType(a.hausType) && !isLiabilityType(a.hausType));
  const rated = cashAccs.filter((a) => a.interestRate != null && (a.currentBalance ?? 0) > 0);
  const ratedTotal = rated.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
  const cashRate = ratedTotal > 0 ? rated.reduce((s, a) => s + (a.currentBalance ?? 0) * (a.interestRate ?? 0), 0) / ratedTotal : null;

  // Cards and debts by rate.
  const cardAccs = accs.filter((a) => a.hausType === "credit_card" && a.limitAmount && a.limitAmount > 0);
  const debts: Debt[] = [];
  for (const a of accs) {
    if (!isLiabilityType(a.hausType) || !(Math.abs(a.currentBalance ?? 0) > 0)) continue;
    const home = properties.find((p) => p.mortgageAccountId === a.id);
    debts.push({
      name: withoutInstitution(accountLabel(a.name, a.item.institutionName), a.item.institutionName),
      balance: Math.abs(a.currentBalance ?? 0),
      rate: a.interestRate ?? home?.rate ?? null,
      kind: a.hausType === "credit_card" ? "card" : a.hausType === "mortgage" ? "mortgage" : "loan",
    });
  }
  for (const p of properties.filter((x) => matchesOwner(x.owner, filter) && !x.mortgageAccountId && (x.mortgageBalance ?? 0) > 0)) {
    debts.push({ name: `${p.label} mortgage`, balance: p.mortgageBalance ?? 0, rate: p.rate, kind: "mortgage" });
  }
  const since90 = subDays(now, 90).toISOString().slice(0, 10);
  const fees90 = reports.flows
    .filter((f) => f.kind === "spend" && f.category === PFC_LABELS.BANK_FEES && f.date >= since90)
    .reduce((s, f) => s + f.amount, 0);

  // Net worth a year ago, or the oldest on file when it is at least two months old.
  const yearAgo = subDays(now, 365).getTime();
  const then =
    [...snapshots].reverse().find((s) => s.date.getTime() <= yearAgo) ??
    (snapshots[0] && now.getTime() - snapshots[0].date.getTime() > 60 * 86_400_000 ? snapshots[0] : undefined);
  const thenDay = then ? then.date.toISOString().slice(0, 10) : null;
  const firstFlow = reports.flows.reduce<string | null>((m, f) => (!m || f.date < m ? f.date : m), null);
  const savedSince =
    thenDay && firstFlow && firstFlow <= addDaysIso(thenDay, 7)
      ? reports.flows.filter((f) => f.date >= thenDay).reduce((s, f) => s + (f.kind === "income" ? f.amount : f.kind === "spend" ? -f.amount : 0), 0)
      : null;

  // What is invested, and the stock / bond / cash mix.
  const a = overview.allocation;
  const invested = a.stocks + a.crypto + a.retirement;
  const held = holdings.filter((h) => matchesOwner(h.account.owner, filter) && (isInvestmentType(h.account.hausType) || h.account.hausType === "hsa"));
  const mix = { stocks: 0, bonds: 0, cash: 0 };
  const heldByAccount = new Map<string, number>();
  for (const h of held) {
    const value = holdingValue(h);
    heldByAccount.set(h.accountId, (heldByAccount.get(h.accountId) ?? 0) + value);
    if (isCryptoHoldingType(h.type)) continue;
    const type = (h.type ?? "").toLowerCase();
    if (type === "cash" || type.includes("money market")) mix.cash += value;
    else if (type.includes("fixed income") || BOND_NAME.test(h.name)) mix.bonds += value;
    else mix.stocks += value;
  }
  for (const acc of accs.filter((x) => isInvestmentType(x.hausType) && !isChildAccountType(x.hausType))) {
    const left = (acc.currentBalance ?? 0) - (heldByAccount.get(acc.id) ?? 0);
    if (left > 1) mix.cash += left;
  }
  for (const m of manualStocks.filter((row) => matchesOwner(row.owner, filter))) {
    const value = m.coingeckoId === FIXED_USD_ID ? (m.quotePrice ?? 0) : (m.quotePrice ?? 0) * m.quantity;
    const cls = (m.assetClass ?? "").toLowerCase();
    if (cls.includes("cash")) mix.cash += value;
    else if (cls.includes("bond") || cls.includes("fixed") || BOND_NAME.test(m.name)) mix.bonds += value;
    else mix.stocks += value;
  }

  // Retirement: the planner's own verdict, and this year's contributions against the limits.
  const retirementRows = retirementData.rows.filter((r) => !isChildAccountType(r.kind));
  const childRows = retirementData.rows.filter((r) => isChildAccountType(r.kind));
  const childBalances = childRows.reduce((s, r) => s + r.balance, 0);
  const ytd = retirementRows.reduce((s, r) => s + r.ytd, 0);
  const estimate = estimateSaving({
    payAnnual: pay.annual,
    spendAnnual: run ? run.total * run.factor : null,
    contributionsYtd: ytd,
    vestAnnual: equity.vests.annual,
    esppAnnual: equity.espp.annual,
    now,
  });
  const snap =
    names.tabs.retirement
      ? retirementSnapshot({
          prefs,
          holders: [
            { key: "A", birthdate: names.birthdateA },
            { key: "B", birthdate: names.birthdateB },
          ],
          today,
          investedDefault: overview.tiles.cash + overview.tiles.investments - childBalances,
          spendNow: run ? Math.round(run.noLoans * run.factor) : null,
          saveNow: estimate?.amount ?? null,
          childBalances,
          householdChildren: names.children.map((c) => ({ id: c.id, name: c.name })),
        })
      : null;
  const roomKeys = new Set<string>();
  let room = 0;
  for (const r of retirementRows) {
    const group = r.kind === "401k" || r.kind === "403b" ? "work" : r.kind === "hsa" ? "hsa" : "ira";
    const key = group === "hsa" ? "hsa" : `${group}:${r.owner}`;
    if (roomKeys.has(key)) continue;
    roomKeys.add(key);
    room += group === "work" ? IRS_LIMITS.electiveDeferral : group === "hsa" ? IRS_LIMITS.hsaFamily : IRS_LIMITS.ira;
  }

  // College: each child's college years still ahead at the planner's yearly cost.
  const kids = mergeChildren(prefs.planChildren, names.children);
  const collegeAnnual = prefs.collegeAnnual ?? PLAN_DEFAULTS.collegeAnnual;
  const year = now.getFullYear();
  const collegeYears = kids.reduce((s, k) => {
    if (k.birthYear == null) return s;
    let n = 0;
    for (let y = k.birthYear + 18; y <= k.birthYear + 21; y++) if (y >= year) n += 1;
    return s + n;
  }, 0);
  const firstCollege = kids
    .filter((k) => k.birthYear != null && k.birthYear + 21 >= year)
    .reduce<number | null>((m, k) => Math.min(m ?? Infinity, Math.max(year, k.birthYear! + 18)), null);
  // College bills start in the fall of the first college year.
  const monthsToFirst = firstCollege != null ? Math.max(0, (firstCollege - year) * 12 + (8 - now.getMonth())) : 0;

  const grossAssets = overview.netWorth + overview.tiles.liabilities;
  const mustPay = mustPayMonthly(reports.flows, now);
  const insights = buildInsights({
    cash: cashflow.cash,
    monthlyEssential: mustPay.monthly,
    essentialParts: mustPay.parts,
    cashRate,
    growthRate: prefs.rate ?? PLAN_DEFAULTS.rate,
    realGrowth: realReturn((prefs.rate ?? PLAN_DEFAULTS.rate) / 100, (prefs.inflation ?? PLAN_DEFAULTS.inflation) / 100),
    income3,
    vests3,
    vestMonths: equity.vests.months,
    espp3,
    esppMonths: equity.espp.months,
    spend3,
    housing3,
    takeHome3: income3 - payroll3 - espp3,
    payAnnual: pay.annual,
    spendAnnual: run ? run.total * run.factor : null,
    cards: {
      used: cardAccs.reduce((s, x) => s + Math.abs(x.currentBalance ?? 0), 0),
      limit: cardAccs.reduce((s, x) => s + (x.limitAmount ?? 0), 0),
      count: cardAccs.length,
    },
    debts,
    fees90,
    netWorth: overview.netWorth,
    grossAssets,
    liabilities: overview.tiles.liabilities,
    netWorthThen: then ? { value: then.netWorth, date: formatShortDate(then.date) } : null,
    savedSince,
    invested,
    crypto: a.crypto,
    mix: mix.stocks + mix.bonds + mix.cash > 0 ? mix : null,
    retirement: snap,
    contributions: retirementRows.length && estimate ? { ytd, room, yearFraction: estimate.yearFraction } : null,
    college:
      kids.length && collegeYears > 0 && firstCollege != null
        ? {
            balances: childBalances,
            cost: collegeYears * collegeAnnual,
            children: kids.length,
            firstYear: firstCollege,
            monthsToFirst,
            planned: snap?.number != null,
          }
        : null,
  });

  return {
    insights: rankInsights(insights),
    actions: topActions(insights),
    // The checkup line shows the same last-three-months figures (x4) that the savings rate uses.
    payAnnual: income3 * 4,
    spendAnnual: window.length ? spend3 * 4 : null,
    savingsRate: income3 > 0 ? (income3 - spend3) / income3 : null,
  };
}

function addDaysIso(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatShortDate(d: Date) {
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

type Flow = { date: string; month: string; kind: "spend" | "income" | "invest"; category: string; merchant: string; amount: number };

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** True for employment take-home (salary / contractor). Excludes interest, rentals, credits. */
// Flows carry display labels ("Paychecks", "Salary"), so match those as well as raw "Income ..." categories.
// Regular deposits from an unlinked account count too: they are pay that lands somewhere Haus can't see.
const TAKE_HOME_LABELS = new Set([PFC_LABELS.INCOME_WAGES, PFC_LABELS.INCOME_SALARY, OUTSIDE_DEPOSIT_LABEL].map((label) => label.toLowerCase()));

export function isTakeHome(category: string) {
  const c = category.toLowerCase();
  if (TAKE_HOME_LABELS.has(c)) return true;
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

const LOAN_PAYMENTS = "Loan payments";
const FIXED_SPEND = new Set([LOAN_PAYMENTS, "Rent and utilities"]);



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
    const noLoans = rows.filter((f) => f.category !== LOAN_PAYMENTS).reduce((s, f) => s + f.amount, 0);
    return { total, discretionary, noLoans, basis: `${days} days`, factor: Math.round((365 / days) * 10) / 10 };
  }
  const set = new Set(months);
  const rows = spend.filter((f) => set.has(f.month));
  const total = rows.reduce((s, f) => s + f.amount, 0);
  const discretionary = rows.filter((f) => !FIXED_SPEND.has(f.category)).reduce((s, f) => s + f.amount, 0);
  const noLoans = rows.filter((f) => f.category !== LOAN_PAYMENTS).reduce((s, f) => s + f.amount, 0);
  const n = months.length;
  return {
    total,
    discretionary,
    /** Everything but loan payments: what a household still spends once its loans are gone. */
    noLoans,
    basis: `${n} complete month${n === 1 ? "" : "s"}`,
    factor: Math.round((12 / n) * 100) / 100,
  };
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
