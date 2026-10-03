export const RANGE_KEYS = ["1m", "3m", "6m", "1y", "all"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export type CalKey = `cal:${string}`;
/** A window the household picks by its two days, both included: `custom:YYYY-MM-DD:YYYY-MM-DD`. */
export type CustomKey = `custom:${string}:${string}`;
export type WindowKey = RangeKey | CalKey | CustomKey;
export const DEFAULT_RANGE: RangeKey = "3m";

export function isCalKey(key: string): key is CalKey {
  return key.startsWith("cal:");
}

export function isCustomKey(key: string): key is CustomKey {
  return key.startsWith("custom:");
}

/** The custom window from two days in either order. */
export function customKey(a: string, b: string): CustomKey {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return `custom:${from}:${to}`;
}

/** First and last day of a custom window, and how many days it spans (both ends counted). */
export function customBounds(key: CustomKey) {
  const [, from, to] = key.split(":");
  const days = Math.round((asLocalDate(to).getTime() - asLocalDate(from).getTime()) / 86_400_000) + 1;
  return { from, to, days: Math.max(1, days) };
}

/** Local wall-time YYYY-MM (chip labels / "today"). */
export function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Calendar day for values stored as UTC midnight (Plaid transaction dates).
 * Uses the UTC YYYY-MM-DD, not local getFullYear/getMonth/getDate.
 */
export function dayKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** The `count` complete months before the current one, oldest first, as YYYY-MM. */
export function priorMonths(now: Date, count = 3) {
  const months: string[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/** A stored calendar day falls in the three complete months before the current one. */
export function inPriorMonths(date: string, now: Date, count = 3) {
  return priorMonths(now, count).includes(date.slice(0, 7));
}

/** YYYY-MM of a stored calendar date (ISO string prefix or UTC midnight Date). */
export function storedYm(date: Date | string) {
  if (typeof date === "string") {
    const m = date.match(/^(\d{4}-\d{2})/);
    if (m) return m[1];
    date = new Date(date);
  }
  return dayKey(date).slice(0, 7);
}

/** Parse YYYY-MM or YYYY-MM-DD as local calendar dates (avoid UTC off-by-one). */
export function asLocalDate(date: Date | string): Date {
  if (date instanceof Date) return date;
  const m = date.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? 1));
  return new Date(date);
}

/** Oldest of the last `count` months on the left (Jul, Aug, Sep). */
export function calendarMonthOptions(count = 3, now = new Date()) {
  const out: { key: CalKey; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `cal:${ymKey(d)}`,
      label: d.toLocaleString("en-US", { month: "short" }),
    });
  }
  return out;
}

export type MonthDefault = "current" | "previous";

/** The calendar month a date-chip row opens on. */
export function monthChip(which: MonthDefault, now = new Date()): CalKey {
  const d = new Date(now.getFullYear(), now.getMonth() - (which === "previous" ? 1 : 0), 1);
  return `cal:${ymKey(d)}`;
}

/** Date chips open on the current month unless Settings says the previous one. */
export function defaultReportWindow(now = new Date()): CalKey {
  return monthChip("current", now);
}

/** Current calendar month. A Budget link always lands here. */
export function defaultTxnWindow(now = new Date()): CalKey {
  return monthChip("current", now);
}

/** A calendar month is complete once it has ended. The open month is never complete. */
export function isCompleteMonth(month: string, now = new Date()) {
  return month < ymKey(now);
}

/** Institutions typically still return about 90 days, which is three calendar months. */
export const RECENT_CASHFLOW_MONTHS = 3;

/** Latest `count` calendar months, newest first, including the open month. */
export function recentMonthKeys(count = RECENT_CASHFLOW_MONTHS, now = new Date()) {
  const [ye, me] = ymKey(now).split("-").map(Number);
  const out: string[] = [];
  let y = ye;
  let m = me;
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/**
 * Month rows for the cashflow table.
 * The latest three calendar months always show — that is the window institutions still return.
 * An older month shows only when every saved institution already has history on or before that
 * month's first day (`archiveCoversFrom`), so a partial leading month from a ~90-day pull is left out.
 */
export function cashflowTableMonths(activityMonths: string[], archiveCoversFrom: string | null, now = new Date()) {
  const current = ymKey(now);
  const keys = new Set(recentMonthKeys(RECENT_CASHFLOW_MONTHS, now));
  const floor = archiveCoversFrom ? archiveCoversFrom.slice(0, 10) : null;
  for (const month of activityMonths) {
    if (month > current || keys.has(month)) continue;
    if (floor && floor <= `${month}-01`) keys.add(month);
  }
  return [...keys].filter((m) => m <= current).sort().reverse();
}

/**
 * Every month from the earliest key through the current month, newest first.
 * Complete months (and the current partial month) are included; future months are not.
 */
export function monthKeysThroughCurrent(earliest: string | null, now = new Date()) {
  const current = ymKey(now);
  const start = earliest && earliest <= current ? earliest : current;
  const out: string[] = [];
  const [ys, ms] = start.split("-").map(Number);
  const [ye, me] = current.split("-").map(Number);
  let y = ye;
  let m = me;
  while (y > ys || (y === ys && m >= ms)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export function rangeStart(key: RangeKey, now = new Date()): Date | null {
  if (key === "all") return null;
  const d = new Date(now);
  const months = key === "1m" ? 1 : key === "3m" ? 3 : key === "6m" ? 6 : 12;
  d.setMonth(d.getMonth() - months);
  return d;
}

export function inRange(date: Date | string, key: RangeKey) {
  const start = rangeStart(key);
  if (!start) return true;
  const day = asLocalDate(date);
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const point = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return point >= from;
}

export function inWindow(date: Date | string, key: WindowKey) {
  if (isCalKey(key)) return storedYm(date) === key.slice(4);
  if (isCustomKey(key)) {
    const { from, to } = customBounds(key);
    const day = typeof date === "string" ? date.slice(0, 10) : dayKey(date);
    return day >= from && day <= to;
  }
  return inRange(date, key);
}
