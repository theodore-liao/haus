import { isCalKey, ymKey, type WindowKey } from "./range";

export type BudgetRow = { category: string; monthly: number };

/** How many monthly budgets the selected date chip covers. */
export function budgetMonths(key: WindowKey, spendMonths: number) {
  if (isCalKey(key) || key === "1m") return 1;
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
