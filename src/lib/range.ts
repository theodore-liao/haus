export const RANGE_KEYS = ["1m", "3m", "6m", "1y", "all"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export type CalKey = `cal:${string}`;
export type WindowKey = RangeKey | CalKey;
export const DEFAULT_RANGE: RangeKey = "3m";

export function isCalKey(key: string): key is CalKey {
  return key.startsWith("cal:");
}

export function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function dayKey(d: Date) {
  return `${ymKey(d)}-${String(d.getDate()).padStart(2, "0")}`;
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

/** Strict prior calendar month (August when today is in September). */
export function defaultReportWindow(now = new Date()): CalKey {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `cal:${ymKey(d)}`;
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
  if (isCalKey(key)) {
    const want = key.slice(4);
    if (typeof date === "string" && /^\d{4}-\d{2}$/.test(date)) return date === want;
    if (typeof date === "string" && /^\d{4}-\d{2}/.test(date)) return date.slice(0, 7) === want;
    return ymKey(new Date(date)) === want;
  }
  return inRange(date, key);
}
