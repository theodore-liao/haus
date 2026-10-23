// Large one-off costs the retirement planner plans for (a home, a car, a wedding), as the household saves them.
import type { PlanExpense } from "./retirement-plan";

export const EXPENSE_KINDS = [
  { value: "home", label: "Home" },
  { value: "vehicle", label: "Vehicle" },
  { value: "renovation", label: "Renovation" },
  { value: "education", label: "Education" },
  { value: "wedding", label: "Wedding" },
  { value: "medical", label: "Medical" },
  { value: "travel", label: "Travel" },
  { value: "other", label: "Other" },
] as const;

export type ExpenseKind = (typeof EXPENSE_KINDS)[number]["value"];

/** One planned expense: what it is, the calendar year it's paid, and its cost in today's prices. Blank until filled in. */
export type PlanExpensePref = { id: string; kind: ExpenseKind; year: number | null; amount: number | null };

/** A planner can hold this many. */
export const MAX_EXPENSES = 12;

export function expenseLabel(kind: string) {
  return EXPENSE_KINDS.find((k) => k.value === kind)?.label ?? "Other";
}

/** A saved list as it comes back, keeping only well-formed entries. */
export function parseExpenses(raw: unknown): PlanExpensePref[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const kinds = new Set<string>(EXPENSE_KINDS.map((k) => k.value));
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return raw
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .filter((e) => typeof e.id === "string" && typeof e.kind === "string" && kinds.has(e.kind))
    .slice(0, MAX_EXPENSES)
    .map((e) => ({ id: e.id as string, kind: e.kind as ExpenseKind, year: num(e.year), amount: num(e.amount) }));
}

/**
 * The household's planned expenses. Before the list was saved, the planner had one house: its cash price, bought the year
 * the household retires (moving with the slider) or at a set age. That house becomes the list's first entry until the
 * list is edited, so a saved plan keeps its answer.
 */
export function plannedExpenses(
  prefs: { expenses?: PlanExpensePref[]; housePrice?: number | null; houseAge?: number | null; houseAtRetire?: boolean },
  at: { retireYear: number; currentYear: number; planAge: number },
): PlanExpensePref[] {
  if (prefs.expenses) return prefs.expenses;
  if (prefs.housePrice == null || !(prefs.housePrice > 0)) return [];
  const year =
    prefs.houseAtRetire !== false
      ? at.retireYear
      : prefs.houseAge != null
        ? at.currentYear + (prefs.houseAge - Math.floor(at.planAge))
        : null;
  return [{ id: "house", kind: "home", year, amount: prefs.housePrice }];
}

/** Whether the plan can count an entry: it has a cost and a year, and the year hasn't passed. */
export function countable(e: PlanExpensePref, currentYear: number): e is PlanExpensePref & { year: number; amount: number } {
  return e.year != null && e.year >= currentYear && e.amount != null && e.amount > 0;
}

/** The entries the plan can count, on the planner's age scale. */
export function expensesForPlan(list: PlanExpensePref[], at: { currentYear: number; planAge: number }): PlanExpense[] {
  return list
    .filter((e) => countable(e, at.currentYear))
    .map((e) => ({ age: Math.floor(at.planAge) + (e.year! - at.currentYear), amount: e.amount! }));
}
