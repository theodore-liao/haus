import { prisma } from "./db";
import { matchesOwner, type OwnerFilter } from "./owners";
import { isCashType, isInvestmentType, isLiabilityType } from "./account-types";
import { startOfDay } from "./format";
import { historyAgreesWithSpot, loadPriceMap, priceOnOrBefore, RECENT_CLOSE_DAYS } from "./quotes";
import { propertyDebt, vehicleDebt } from "./property";
import { loadCryptoLots } from "./crypto-lots";
import { FIXED_USD_ID } from "./constants";

function holdingValueNow(h: {
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

function sampleDates(from: Date, to: Date): Date[] {
  const start = startOfDay(from);
  const end = startOfDay(to);
  const dailyFrom = new Date(end);
  dailyFrom.setDate(dailyFrom.getDate() - 45);
  const out: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const daysSinceStart = Math.round((cursor.getTime() - start.getTime()) / 86400000);
    const include =
      cursor.getTime() === start.getTime() ||
      cursor.getTime() === end.getTime() ||
      cursor >= dailyFrom ||
      cursor.getDate() === 1 ||
      daysSinceStart % 7 === 0;
    if (include) out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Events sorted by time with a suffix sum, so "total after date X" is one binary search instead of a scan. */
class AfterSum {
  private times: number[];
  private suffix: number[];
  constructor(events: { t: number; v: number }[]) {
    events.sort((a, b) => a.t - b.t);
    this.times = events.map((e) => e.t);
    this.suffix = new Array(events.length + 1).fill(0);
    for (let i = events.length - 1; i >= 0; i--) this.suffix[i] = this.suffix[i + 1] + events[i].v;
  }
  /** Sum of values with t > asOf. */
  after(asOf: number) {
    let lo = 0;
    let hi = this.times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.times[mid] <= asOf) lo = mid + 1;
      else hi = mid;
    }
    return this.suffix[lo];
  }
}

/** Signed quantity deltas for one holding: buys subtract when rolled back, sells add. */
function holdingQtyEvents(
  holding: { symbol: string | null },
  txns: { date: Date; type: string; subtype: string | null; quantity: number | null; symbol: string | null }[],
) {
  const sym = holding.symbol?.toUpperCase() ?? "";
  const out: { t: number; v: number }[] = [];
  for (const t of txns) {
    const tSym = t.symbol?.toUpperCase() ?? "";
    if (sym && tSym && tSym !== sym) continue;
    if (sym && !tSym) continue;
    const qty = t.quantity ?? 0;
    if (!qty) continue;
    const type = `${t.type} ${t.subtype ?? ""}`.toLowerCase();
    if (type.includes("buy") || type.includes("purchase")) out.push({ t: t.date.getTime(), v: -qty });
    else if (type.includes("sell")) out.push({ t: t.date.getTime(), v: qty });
  }
  return new AfterSum(out);
}

type PathPoint = { date: string; netWorth: number };
const PATH_TTL_MS = 60_000;
const pathMemo = new Map<OwnerFilter, { at: number; value: Promise<PathPoint[]> }>();

/** Drop the memoised paths after a sync or manual edit so the next render recomputes. */
export function invalidateNetWorthPath() {
  pathMemo.clear();
}

/** Memoised for a minute per owner filter: the path only changes when the ledger does, and every
 *  Overview / Insights render was paying for the full rebuild. */
export function reconstructNetWorthPath(filter: OwnerFilter): Promise<PathPoint[]> {
  const hit = pathMemo.get(filter);
  if (hit && Date.now() - hit.at < PATH_TTL_MS) return hit.value;
  const value = buildNetWorthPath(filter);
  pathMemo.set(filter, { at: Date.now(), value });
  value.catch(() => pathMemo.delete(filter));
  return value;
}

async function buildNetWorthPath(filter: OwnerFilter): Promise<PathPoint[]> {
  const [accounts, txns, holdings, invTxns, manuals, cryptos, properties, vehicles, stockManuals] = await Promise.all([
    prisma.account.findMany({ include: { item: true } }),
    prisma.txn.findMany({ select: { accountId: true, date: true, amount: true } }),
    prisma.holding.findMany(),
    prisma.investmentTxn.findMany({ include: { security: true } }),
    prisma.manualAccount.findMany(),
    loadCryptoLots(),
    prisma.property.findMany(),
    prisma.vehicle.findMany(),
    prisma.manualHolding.findMany({ where: { kind: "security" } }),
  ]);

  const accs = accounts.filter((a) => matchesOwner(a.owner, filter));
  const mans = manuals.filter((m) => matchesOwner(m.owner, filter));
  const coins = cryptos.filter((c) => matchesOwner(c.owner, filter));
  const props = properties.filter((p) => matchesOwner(p.owner, filter));
  const vehs = vehicles.filter((v) => matchesOwner(v.owner, filter));
  const stockLots = stockManuals.filter((h) => matchesOwner(h.owner, filter));

  const txnDates = txns.map((t) => t.date);
  const invDates = invTxns.map((t) => t.date);
  const earliest =
    [...txnDates, ...invDates].sort((a, b) => a.getTime() - b.getTime())[0] ??
    new Date(Date.now() - 365 * 86400000);
  const floor = new Date();
  floor.setDate(floor.getDate() - 730);
  const from = earliest < floor ? floor : earliest;
  const to = new Date();

  const priceSymbols: { symbol: string; coingeckoId?: string | null }[] = [];
  for (const h of holdings) {
    if (h.symbol) priceSymbols.push({ symbol: h.symbol });
  }
  for (const c of coins) {
    priceSymbols.push({ symbol: c.symbol, coingeckoId: c.coingeckoId });
  }
  for (const h of stockLots) {
    if (h.coingeckoId === FIXED_USD_ID) continue;
    if (h.symbol) priceSymbols.push({ symbol: h.symbol });
  }
  const priceMap = await loadPriceMap(
    [...new Set(priceSymbols.map((s) => s.symbol.toUpperCase()))],
    from,
    to,
  );

  // Everything that does not depend on the sample date is computed once, up front. The date loop below
  // then does a binary search per account and per holding instead of rescanning every transaction.
  const flowByAcct = new Map<string, { t: number; v: number }[]>();
  for (const t of txns) {
    const list = flowByAcct.get(t.accountId) ?? [];
    list.push({ t: t.date.getTime(), v: t.amount });
    flowByAcct.set(t.accountId, list);
  }
  const flowAfter = new Map<string, AfterSum>();
  for (const [id, events] of flowByAcct) flowAfter.set(id, new AfterSum(events));

  const invByAcct = new Map<string, { date: Date; type: string; subtype: string | null; quantity: number | null; symbol: string | null }[]>();
  for (const t of invTxns) {
    const list = invByAcct.get(t.accountId) ?? [];
    list.push({ date: t.date, type: t.type, subtype: t.subtype, quantity: t.quantity, symbol: t.security?.symbol ?? null });
    invByAcct.set(t.accountId, list);
  }

  // A symbol's history is trusted only if its latest close agrees with the spot we hold today.
  const trustHistory = (sym: string | null | undefined, spot: number | null) =>
    Boolean(sym) && historyAgreesWithSpot(priceOnOrBefore(priceMap, sym!, to, RECENT_CLOSE_DAYS), spot);

  type Lot = { sym: string | null; spot: number | null; useHist: boolean; qtyNow: number; qtyEvents: AfterSum };
  const invAccounts: { current: number; residual: number; lots: Lot[] }[] = [];
  const flowAccounts: { id: string; current: number; asLiability: boolean; bucket: "cash" | "liability" | "investment" | "other" }[] = [];
  for (const a of accs) {
    const current = a.currentBalance ?? 0;
    const lots = holdings.filter((h) => h.accountId === a.id);
    if (isInvestmentType(a.hausType) && lots.length) {
      const invTx = invByAcct.get(a.id) ?? [];
      let mtmNow = 0;
      const prepared: Lot[] = [];
      for (const h of lots) {
        mtmNow += holdingValueNow(h);
        const sym = h.symbol?.toUpperCase() ?? null;
        const spot = h.quotePrice ?? h.institutionPrice;
        prepared.push({ sym, spot, useHist: trustHistory(sym, spot), qtyNow: h.quantity, qtyEvents: holdingQtyEvents(h, invTx) });
      }
      invAccounts.push({ current, residual: current - mtmNow, lots: prepared });
      continue;
    }
    const plaidType = (a.type || "").toLowerCase();
    const asLiability = isLiabilityType(a.hausType) || plaidType === "credit" || plaidType === "loan";
    const bucket = isCashType(a.hausType) && !asLiability ? "cash" : asLiability ? "liability" : isInvestmentType(a.hausType) ? "investment" : "other";
    flowAccounts.push({ id: a.id, current, asLiability, bucket });
  }

  const coinLots = coins.map((c) => {
    const sym = c.symbol.toUpperCase();
    return { sym, spot: c.quotePrice, qty: c.quantity, useHist: trustHistory(sym, c.quotePrice) };
  });
  const stockLotRows = stockLots.map((h) => {
    if (h.coingeckoId === FIXED_USD_ID) return { fixed: h.quotePrice ?? 0, sym: null, spot: null, qty: 0, useHist: false };
    const sym = h.symbol.trim().toUpperCase();
    return { fixed: null, sym, spot: h.quotePrice, qty: h.quantity, useHist: trustHistory(sym, h.quotePrice) };
  });

  // Manual balances and property / vehicle values carry no history of their own; they are constant per sample.
  let constant = 0;
  for (const m of mans) constant += m.balance;
  for (const p of props) {
    constant += p.estimate;
    if (!p.mortgageAccountId) constant -= propertyDebt(p, accs);
  }
  for (const v of vehs) {
    constant += v.estimate;
    if (!v.loanAccountId) constant -= vehicleDebt(v, accs);
  }

  const dates = sampleDates(from, to);
  const path: { date: string; netWorth: number }[] = [];

  for (const asOf of dates) {
    const asOfMs = asOf.getTime();
    let cash = 0;
    let investments = 0;
    let liabilities = 0;
    let otherAssets = 0;

    for (const a of flowAccounts) {
      const flow = flowAfter.get(a.id)?.after(asOfMs) ?? 0;
      const reconstructed = a.asLiability ? a.current - flow : a.current + flow;
      if (a.bucket === "cash") cash += reconstructed;
      else if (a.bucket === "liability") liabilities += Math.abs(reconstructed);
      else if (a.bucket === "investment") investments += reconstructed;
      else otherAssets += reconstructed;
    }

    for (const a of invAccounts) {
      let mtm = 0;
      for (const lot of a.lots) {
        const qty = Math.max(0, lot.qtyNow + lot.qtyEvents.after(asOfMs));
        if (qty <= 0) continue;
        const px = (lot.useHist ? priceOnOrBefore(priceMap, lot.sym!, asOf) : null) ?? lot.spot;
        if (px != null) mtm += qty * px;
      }
      investments += mtm + a.residual;
    }

    for (const c of coinLots) {
      const px = (c.useHist ? priceOnOrBefore(priceMap, c.sym, asOf) : null) ?? c.spot;
      if (px != null) investments += c.qty * px;
    }
    for (const h of stockLotRows) {
      if (h.fixed != null) {
        investments += h.fixed;
        continue;
      }
      const px = (h.useHist ? priceOnOrBefore(priceMap, h.sym!, asOf) : null) ?? h.spot;
      if (px != null) investments += h.qty * px;
    }

    path.push({
      date: asOf.toISOString(),
      netWorth: cash + investments + otherAssets + constant - liabilities,
    });
  }

  return path;
}
