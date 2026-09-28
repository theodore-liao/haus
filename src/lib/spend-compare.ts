// Spend by category against an earlier window, and one category month by month. Pure for tests.
import { addDays, addMonths, format } from "date-fns";
import { asLocalDate, cashflowTableMonths, isCalKey, rangeStart, ymKey, type WindowKey } from "./range";
import { aggregateFlows, applyMerchantRefunds, type FlowRow } from "./spend-net";

/** Local calendar day as YYYY-MM-DD. */
function localDay(d: Date) {
  return format(d, "yyyy-MM-dd");
}

/** A flow's calendar day. Stored dates are UTC midnight, so the ISO prefix is the day. */
function flowDay(f: FlowRow) {
  return f.date.slice(0, 10);
}

/**
 * The window to compare the chosen date chip against: the month before a month chip (only up to
 * the same day while the month is still open), or the same length of time just before a rolling chip.
 * `to` is exclusive. Null for All.
 */
export function previousWindow(key: WindowKey, now = new Date()): { from: string; to: string; label: string } | null {
  if (isCalKey(key)) {
    const month = asLocalDate(`${key.slice(4)}-01`);
    const prev = addMonths(month, -1);
    if (key.slice(4) === ymKey(now)) {
      const lastPrev = addDays(month, -1).getDate();
      const day = Math.min(now.getDate(), lastPrev);
      return {
        from: localDay(prev),
        to: localDay(addDays(new Date(prev.getFullYear(), prev.getMonth(), day), 1)),
        label: `${format(prev, "MMM")} 1–${day}`,
      };
    }
    return { from: localDay(prev), to: localDay(month), label: format(prev, "MMMM") };
  }
  if (key === "all") return null;
  const start = rangeStart(key, now)!;
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const months = key === "1m" ? 1 : key === "3m" ? 3 : key === "6m" ? 6 : 12;
  return {
    from: localDay(addMonths(from, -months)),
    to: localDay(from),
    label: months === 1 ? "the month before" : months === 12 ? "the year before" : `the ${months} months before`,
  };
}

const HISTORY_SLACK_DAYS = 3;

/** Change per category against the previous window: a fraction, or "new" when it had no spend then. */
export type CategoryChange = number | "new";

/**
 * Null when there is nothing fair to compare against: the All chip, or stored history that does
 * not reach back to the start of the previous window.
 */
export function categoryChanges(
  flows: FlowRow[],
  current: { label: string; value: number }[],
  key: WindowKey,
  now = new Date(),
): { changes: Map<string, CategoryChange>; label: string } | null {
  const prev = previousWindow(key, now);
  if (!prev) return null;
  const spend = flows.filter((f) => f.kind === "spend");
  if (!spend.length) return null;
  const earliest = spend.reduce((min, f) => (flowDay(f) < min ? flowDay(f) : min), flowDay(spend[0]));
  // A few quiet days at the start of history are normal; more than that means the window is only partly on file.
  if (earliest > localDay(addDays(asLocalDate(prev.from), HISTORY_SLACK_DAYS))) return null;
  const inPrev = flows.filter((f) => flowDay(f) >= prev.from && flowDay(f) < prev.to);
  const before = new Map(aggregateFlows(applyMerchantRefunds(inPrev)).spendRows.map((r) => [r.label, r.value]));
  const changes = new Map<string, CategoryChange>();
  for (const row of current) {
    const then = before.get(row.label) ?? 0;
    changes.set(row.label, then > 0.005 ? (row.value - then) / then : "new");
  }
  return { changes, label: prev.label };
}

export type TrendPoint = { month: string; label: string; value: number; partial: boolean };

/**
 * One category's spend per month, oldest first, for up to twelve months. Months follow the
 * Overview month-by-month rule, so a partly downloaded month is left out. The open month is partial.
 */
export function categoryTrend(
  flows: FlowRow[],
  category: string,
  archiveCoversFrom: string | null,
  now = new Date(),
  count = 12,
): TrendPoint[] {
  const activity = [...new Set(flows.filter((f) => f.kind === "spend").map((f) => f.month))];
  const months = cashflowTableMonths(activity, archiveCoversFrom, now).slice(0, count).reverse();
  const current = ymKey(now);
  return months.map((month) => {
    const rows = applyMerchantRefunds(flows.filter((f) => f.month === month));
    const value = aggregateFlows(rows).spendRows.find((r) => r.label === category)?.value ?? 0;
    return { month, label: format(asLocalDate(`${month}-01`), "MMM"), value, partial: month === current };
  });
}
