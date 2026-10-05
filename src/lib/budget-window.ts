import { customBounds, isCalKey, isCustomKey, ymKey, type WindowKey } from "./range";

export type BudgetRow = { category: string; monthly: number };

/** How many monthly budgets the selected date chip covers. */
export function budgetMonths(key: WindowKey, spendMonths: number) {
  if (isCalKey(key) || key === "1m") return 1;
  // A custom window budgets its share of the year: 45 days is about 1.5 monthly budgets.
  if (isCustomKey(key)) return customBounds(key).days / (365.25 / 12);
  if (key === "3m") return 3;
  if (key === "6m") return 6;
  if (key === "1y") return 12;
  return Math.max(1, spendMonths);
}

/** Days left in the open calendar month, including today. Null for every other chip. */
export function daysLeftInMonth(key: WindowKey, now = new Date()): number | null {
  if (!isCalKey(key) || key.slice(4) !== ymKey(now)) return null;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(0, last - now.getDate() + 1);
}

/** Share of the open calendar month that has passed, through today. Null for every other chip. */
export function monthElapsed(key: WindowKey, now = new Date()): number | null {
  if (!isCalKey(key) || key.slice(4) !== ymKey(now)) return null;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / last;
}

/** Spending this far ahead of the calendar counts as ahead of pace. */
export const PACE_SLACK = 0.1;

/**
 * "over" once spend passes the budget. "ahead" when, in the open month, the share spent is more
 * than PACE_SLACK past the share of the month gone. Otherwise "ok".
 */
export function budgetStatus(spent: number, target: number, elapsed: number | null): "over" | "ahead" | "ok" {
  if (spent > target + 0.005) return "over";
  if (elapsed == null || target <= 0) return "ok";
  return spent / target > elapsed + PACE_SLACK ? "ahead" : "ok";
}
