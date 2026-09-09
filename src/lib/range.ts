export const RANGE_KEYS = ["1m", "3m", "6m", "1y", "all"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const DEFAULT_RANGE: RangeKey = "3m";

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
  return new Date(date) >= start;
}
