import { prisma } from "./db";
import { matchesOwner, type OwnerFilter } from "./owners";
import { isCashType, isInvestmentType, isLiabilityType } from "./account-types";
import { startOfDay } from "./format";
import { historyAgreesWithSpot, loadPriceMap, priceOnOrBefore } from "./quotes";
import { propertyDebt, vehicleDebt } from "./property";
import { loadCryptoLots } from "./crypto-lots";

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

function qtyAt(
  holding: { symbol: string | null; quantity: number },
  asOf: Date,
  txns: { date: Date; type: string; subtype: string | null; quantity: number | null; symbol: string | null }[],
) {
  let q = holding.quantity;
  const sym = holding.symbol?.toUpperCase() ?? "";
  for (const t of txns) {
    if (t.date <= asOf) continue;
    const tSym = t.symbol?.toUpperCase() ?? "";
    if (sym && tSym && tSym !== sym) continue;
    if (sym && !tSym) continue;
    const type = `${t.type} ${t.subtype ?? ""}`.toLowerCase();
    const qty = t.quantity ?? 0;
    if (!qty) continue;
    if (type.includes("buy") || type.includes("purchase")) q -= qty;
    else if (type.includes("sell")) q += qty;
  }
  return Math.max(0, q);
}

export async function reconstructNetWorthPath(filter: OwnerFilter): Promise<{ date: string; netWorth: number }[]> {
  const [accounts, txns, holdings, invTxns, manuals, cryptos, properties, vehicles] = await Promise.all([
    prisma.account.findMany({ include: { item: true } }),
    prisma.txn.findMany({ select: { accountId: true, date: true, amount: true } }),
    prisma.holding.findMany(),
    prisma.investmentTxn.findMany({ include: { security: true } }),
    prisma.manualAccount.findMany(),
    loadCryptoLots(),
    prisma.property.findMany(),
    prisma.vehicle.findMany(),
  ]);

  const accs = accounts.filter((a) => matchesOwner(a.owner, filter));
  const mans = manuals.filter((m) => matchesOwner(m.owner, filter));
  const coins = cryptos.filter((c) => matchesOwner(c.owner, filter));
  const props = properties.filter((p) => matchesOwner(p.owner, filter));
  const vehs = vehicles.filter((v) => matchesOwner(v.owner, filter));

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
  const priceMap = await loadPriceMap(
    [...new Set(priceSymbols.map((s) => s.symbol.toUpperCase()))],
    from,
    to,
  );

  const txnsByAcct = new Map<string, { date: Date; amount: number }[]>();
  for (const t of txns) {
    const list = txnsByAcct.get(t.accountId) ?? [];
    list.push(t);
    txnsByAcct.set(t.accountId, list);
  }
  const holdsByAcct = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const list = holdsByAcct.get(h.accountId) ?? [];
    list.push(h);
    holdsByAcct.set(h.accountId, list);
  }
  const invByAcct = new Map<string, { date: Date; type: string; subtype: string | null; quantity: number | null; symbol: string | null }[]>();
  for (const t of invTxns) {
    const list = invByAcct.get(t.accountId) ?? [];
    list.push({
      date: t.date,
      type: t.type,
      subtype: t.subtype,
      quantity: t.quantity,
      symbol: t.security?.symbol ?? null,
    });
    invByAcct.set(t.accountId, list);
  }

  const dates = sampleDates(from, to);
  const path: { date: string; netWorth: number }[] = [];

  for (const asOf of dates) {
    let cash = 0;
    let investments = 0;
    let liabilities = 0;
    let otherAssets = 0;

    for (const a of accs) {
      const later = (txnsByAcct.get(a.id) ?? []).filter((t) => t.date > asOf);
      const flow = later.reduce((s, t) => s + t.amount, 0);
      const current = a.currentBalance ?? 0;
      const lots = holdsByAcct.get(a.id) ?? [];

      if (isInvestmentType(a.hausType) && lots.length) {
        const invTx = invByAcct.get(a.id) ?? [];
        let mtm = 0;
        let mtmNow = 0;
        for (const h of lots) {
          mtmNow += holdingValueNow(h);
          const qty = qtyAt(h, asOf, invTx);
          if (qty <= 0) continue;
          const sym = h.symbol?.toUpperCase();
          const spot = h.quotePrice ?? h.institutionPrice;
          const recent = sym ? priceOnOrBefore(priceMap, sym, to, 3) : null;
          const hist =
            sym && historyAgreesWithSpot(recent, spot) ? priceOnOrBefore(priceMap, sym, asOf) : null;
          const px = hist ?? spot;
          if (px != null) mtm += qty * px;
        }
        const residual = current - mtmNow;
        investments += mtm + residual;
        continue;
      }

      const plaidType = (a.type || "").toLowerCase();
      const asLiability =
        isLiabilityType(a.hausType) || plaidType === "credit" || plaidType === "loan";
      const reconstructed = asLiability ? current - flow : current + flow;
      if (isCashType(a.hausType) && !asLiability) cash += reconstructed;
      else if (asLiability) liabilities += Math.abs(reconstructed);
      else if (isInvestmentType(a.hausType)) investments += reconstructed;
      else otherAssets += reconstructed;
    }

    for (const m of mans) {
      investments += m.balance;
    }
    for (const c of coins) {
      const recent = priceOnOrBefore(priceMap, c.symbol.toUpperCase(), to, 3);
      const hist = historyAgreesWithSpot(recent, c.quotePrice)
        ? priceOnOrBefore(priceMap, c.symbol.toUpperCase(), asOf)
        : null;
      const px = hist ?? c.quotePrice;
      if (px != null) investments += c.quantity * px;
    }
    for (const p of props) {
      otherAssets += p.estimate;
      if (!p.mortgageAccountId) liabilities += propertyDebt(p, accs);
    }
    for (const v of vehs) {
      otherAssets += v.estimate;
      if (!v.loanAccountId) liabilities += vehicleDebt(v, accs);
    }

    path.push({
      date: asOf.toISOString(),
      netWorth: cash + investments + otherAssets - liabilities,
    });
  }

  return path;
}
