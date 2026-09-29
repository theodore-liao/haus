// Month-by-month budget results for Goals: each category against its current monthly budget. Pure for tests.
import { storedYm, ymKey } from "./range";
import { aggregateFlows, applyMerchantRefunds, type FlowRow } from "./spend-net";
import type { BudgetRow } from "./budget-window";

export type TrackerMonth = {
  ym: string;
  /** "Jul". */
  label: string;
  /** The open month, judged against the share of its budget the days so far allow. */
  partial: boolean;
};

/** One category in one month. `diff` is budget minus spent: above 0 saved, below 0 over. */
export type TrackerCell = { budget: number; spent: number; diff: number };

export type TrackerRow = { category: string; monthly: number; cells: TrackerCell[]; net: number };

export type BudgetTracker = { months: TrackerMonth[]; rows: TrackerRow[]; totals: TrackerCell[]; net: number };

/** Share of a month's budget that counts so far: the days through today over the days in the month. */
export function monthShare(now: Date) {
  return now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

/**
 * The last `count` calendar months, this one included, for every budget above 0, using today's budget amounts.
 * Rows sort with the furthest behind first.
 */
export function budgetTracker(flows: FlowRow[], budgets: BudgetRow[], now = new Date(), count = 3): BudgetTracker {
  const months: TrackerMonth[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ ym: ymKey(d), label: d.toLocaleString("en-US", { month: "short" }), partial: i === 0 });
  }
  const spentBy = months.map((m) => {
    const netted = applyMerchantRefunds(flows.filter((f) => storedYm(f.date) === m.ym));
    return new Map(aggregateFlows(netted).spendRows.map((r) => [r.label, r.value]));
  });
  const share = monthShare(now);
  const rows = budgets
    .filter((b) => b.monthly > 0)
    .map((b) => {
      const cells = months.map((m, i) => {
        const budget = m.partial ? b.monthly * share : b.monthly;
        const spent = spentBy[i].get(b.category) ?? 0;
        return { budget, spent, diff: budget - spent };
      });
      return { category: b.category, monthly: b.monthly, cells, net: cells.reduce((s, c) => s + c.diff, 0) };
    })
    .sort((a, b) => a.net - b.net);
  const totals = months.map((_, i) => {
    const budget = rows.reduce((s, r) => s + r.cells[i].budget, 0);
    const spent = rows.reduce((s, r) => s + r.cells[i].spent, 0);
    return { budget, spent, diff: budget - spent };
  });
  return { months, rows, totals, net: totals.reduce((s, c) => s + c.diff, 0) };
}

/** Within a dollar either way reads as on budget. */
export const EVEN = 1;

export function netStatus(net: number): "ahead" | "behind" | "even" {
  return net > EVEN ? "ahead" : net < -EVEN ? "behind" : "even";
}
