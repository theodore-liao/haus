import { HAUS_CATEGORIES } from "./categories";
import { applyMerchantRefunds, aggregateFlows, type FlowRow } from "./spend-net";
import { inWindow } from "./range";
import type { BudgetRow } from "./budget-window";

const SKIP = new Set(["Income", "Transfer"]);

function spendLabels(flows: FlowRow[]) {
  const labels = new Set<string>();
  for (const c of HAUS_CATEGORIES) {
    if (c.code === "INCOME" || c.code === "TRANSFER") continue;
    labels.add(c.label);
  }
  for (const f of flows) {
    if (f.kind === "spend" && f.category && !SKIP.has(f.category)) labels.add(f.category);
  }
  return labels;
}

/** Monthly amount for every spend category: trailing 3-month net spend, divided by 3. */
export function budgetAverages(flows: FlowRow[]): BudgetRow[] {
  const labels = spendLabels(flows);
  const sliced = flows.filter((f) => inWindow(f.date, "3m"));
  const totals = new Map(
    aggregateFlows(applyMerchantRefunds(sliced)).spendRows.map((r) => [r.label, r.value]),
  );
  return [...labels]
    .map((category) => ({
      category,
      monthly: Math.max(0, Math.round((totals.get(category) ?? 0) / 3)),
    }))
    .sort((a, b) => b.monthly - a.monthly || a.category.localeCompare(b.category));
}

/**
 * Whether to persist the 3-month averages.
 * "wait" — no spend in the trailing window yet, so do not lock a seed.
 * "write" — fill every category from the average (also replaces an all-zero placeholder).
 * "keep" — the household already has a seed; leave their edits alone.
 */
export function budgetSeedAction(seeded: boolean, stored: BudgetRow[], flows: FlowRow[]): "keep" | "wait" | "write" {
  // A number the household typed wins over a later automatic fill.
  if (stored.some((row) => row.monthly > 0)) return "keep";
  const learned = budgetAverages(flows).some((row) => row.monthly > 0);
  if (!learned) return seeded || stored.length > 0 ? "keep" : "wait";
  // Nothing stored, or every row is still the $0 placeholder from an empty first visit.
  // An empty list after the flag is set means the household deleted every budget.
  if (seeded && stored.length === 0) return "keep";
  return "write";
}
