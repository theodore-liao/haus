// The last N days of a value path, for the small chart in a summary card. Pure for tests.
import { sameAssetClose } from "./period-moves";

export type SparkPoint = { date: string; value: number };

/** Points from the last `days` days (keeping the one just before, so the line starts at the window's edge). */
export function lastDays(points: SparkPoint[], days: number, now = new Date()): { points: SparkPoint[]; change: number | null; pct: number | null } {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const cut = new Date(now.getTime() - days * 86_400_000).toISOString();
  const firstIn = sorted.findIndex((p) => p.date >= cut);
  const from = firstIn < 0 ? sorted.length : Math.max(0, firstIn - 1);
  const window = sorted.slice(from);
  if (window.length < 2) return { points: window, change: null, pct: null };
  const start = window[0].value;
  const end = window[window.length - 1].value;
  return { points: window, change: end - start, pct: start > 0 ? ((end - start) / start) * 100 : null };
}

/**
 * Value a set of holdings each day for the last `days` days, at today's quantities and each day's close.
 * `closeOn` returns the close on or just before a day (null when none); a coin without one holds today's price, so
 * the line never drops because a price is missing. Today uses today's price.
 */
export function holdingsPath(
  holdings: { symbol: string | null; qty: number; value: number }[],
  closeOn: (symbol: string, day: Date) => number | null,
  days: number,
  now = new Date(),
): SparkPoint[] {
  const out: SparkPoint[] = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    let total = 0;
    for (const h of holdings) {
      const sym = h.symbol?.toUpperCase();
      const spot = h.qty > 0 ? h.value / h.qty : null;
      const close = i === 0 || !sym || spot == null ? null : closeOn(sym, d);
      // A close far off today's price belongs to another asset sharing the symbol; hold today's price instead.
      const px = close != null && spot != null && sameAssetClose(close, spot) ? close : spot;
      total += px != null && h.qty > 0 ? h.qty * px : h.value;
    }
    out.push({ date: d.toISOString(), value: total });
  }
  return out;
}
