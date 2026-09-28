import { startOfDay } from "./format";

/** Key for one symbol's close on a local calendar day. Matches the keys in a price map. */
export function priceDayKey(d: Date) {
  return startOfDay(d).toISOString();
}

/** A stored series still covers "today" when its newest bar is only a few days old (weekends included). */
export function historyIsCurrent(latest: Date, to: Date, maxAgeDays: number) {
  const age = Math.round((startOfDay(to).getTime() - startOfDay(latest).getTime()) / 86400000);
  return age >= 0 && age <= maxAgeDays;
}

/**
 * Close about `days` ago. Walks back a few days for a weekend or holiday, and refuses anything older,
 * so a 1W figure cannot be a 1D move from a stale bar.
 */
export function closeDaysAgo(map: Map<string, number>, symbol: string, now: Date, days: number): number | null {
  // Four days covers a weekend plus a Monday holiday. Anything older is a different window.
  const slack = days <= 7 ? 4 : 5;
  const target = startOfDay(now);
  target.setDate(target.getDate() - days);
  for (let i = 0; i <= slack; i++) {
    const d = new Date(target);
    d.setDate(d.getDate() - i);
    const v = map.get(`${symbol}|${priceDayKey(d)}`);
    if (v != null && v > 0) return v;
  }
  return null;
}
