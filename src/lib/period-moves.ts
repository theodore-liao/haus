import { startOfDay } from "./format";
import { priceDayKey } from "./price-window";

/** How far past the target day a stored close may sit and still stand in for it. */
export const PERIOD_TOLERANCE_DAYS = 10;

/** Coins pegged to a dollar. With no history their move is zero, which is true to within noise. */
const PEGGED = new Set(["USDC", "USDT", "DAI", "USDS", "PYUSD", "FDUSD", "TUSD", "USDE", "USD1", "GUSD", "USDP", "BUSD", "LUSD", "FRAX", "SUSD"]);

export function isPegged(symbol: string | null | undefined) {
  return PEGGED.has((symbol ?? "").trim().toUpperCase().replace(/-USD$/, ""));
}

/**
 * Whether a past close can belong to the same asset as today's price. Stocks and coins share one price table by
 * symbol, so a token named like a stock (a $0.005 coin beside a $12 stock) would otherwise pick up the stock's closes.
 */
export function sameAssetClose(then: number, now: number) {
  return then > 0 && now > 0 && then / now <= 10 && then / now >= 0.1;
}

export type PeriodMove = { delta: number | null; pct: number | null };
export type MoverLike = {
  symbol: string | null;
  value: number;
  day: PeriodMove;
  week: PeriodMove;
  month: PeriodMove;
};

/** Best stored close on or before `days` ago, allowing a few days of slack. */
export function closeOnOrBeforeDaysAgo(map: Map<string, number>, symbol: string, now: Date, days: number) {
  const target = startOfDay(now);
  target.setDate(target.getDate() - days);
  for (let i = 0; i <= PERIOD_TOLERANCE_DAYS; i++) {
    const d = new Date(target);
    d.setDate(d.getDate() - i);
    const v = map.get(`${symbol}|${priceDayKey(d)}`);
    if (v != null && v > 0) return v;
  }
  return null;
}

/**
 * Move of the current holding over `days`: today's quantity times (price now minus price then).
 * Purchase dates play no part. `value` is the holding's value now. A pegged coin, or one with no
 * usable past price, reads zero rather than blank.
 */
export function holdingPeriodMove(args: {
  symbol: string;
  value: number;
  last: number;
  days: number;
  closes: Map<string, number>;
  now: Date;
}): PeriodMove {
  const { symbol, value, last, days, closes, now } = args;
  if (!(last > 0) || !Number.isFinite(value)) return { delta: null, pct: null };
  let then = isPegged(symbol) ? last : closeOnOrBeforeDaysAgo(closes, symbol.toUpperCase(), now, days);
  // A close on a different scale is another asset under the same ticker.
  if (then != null && !sameAssetClose(then, last) && !isPegged(symbol)) then = null;
  if (then == null) return { delta: 0, pct: 0 };
  const qty = value / last;
  return { delta: (last - then) * qty, pct: ((last - then) / then) * 100 };
}

/** Fills every empty day, week or month figure. Figures already present are kept. */
export function fillMoverWindows<T extends MoverLike>(
  movers: T[],
  lastBySymbol: Map<string, number>,
  closes: Map<string, number>,
  now: Date,
): T[] {
  return movers.map((m) => {
    const key = m.symbol?.trim().toUpperCase();
    const last = key ? lastBySymbol.get(key) : undefined;
    if (!key || last == null || !(last > 0)) return m;
    const fill = (cur: PeriodMove, days: number) =>
      cur.delta != null ? cur : holdingPeriodMove({ symbol: key, value: m.value, last, days, closes, now });
    return { ...m, day: fill(m.day, 1), week: fill(m.week, 7), month: fill(m.month, 30) };
  });
}
