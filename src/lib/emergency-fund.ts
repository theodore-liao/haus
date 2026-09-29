// What a month of must-pay spending costs: essentials plus every loan payment, from the same flows as Spending,
// so the emergency fund is measured against what would still be due if pay stopped.
import { PFC_LABELS } from "./constants";

export const MUST_PAY = [
  PFC_LABELS.LOAN_PAYMENTS,
  PFC_LABELS.RENT_AND_UTILITIES,
  PFC_LABELS.GROCERIES,
  PFC_LABELS.MEDICAL,
  PFC_LABELS.TRANSPORTATION,
] as string[];

/** Must-pay spending a month, averaged over the last 90 days, with each category's share. */
export function mustPayMonthly(
  flows: { kind: string; category: string; date: string; amount: number }[],
  now = new Date(),
): { monthly: number; parts: { category: string; monthly: number }[] } {
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const byCat = new Map<string, number>();
  for (const f of flows) {
    if (f.kind !== "spend" || f.date < since || f.date > today || !MUST_PAY.includes(f.category)) continue;
    byCat.set(f.category, (byCat.get(f.category) ?? 0) + f.amount);
  }
  const parts = [...byCat.entries()]
    .map(([category, total]) => ({ category, monthly: total / 3 }))
    .filter((p) => p.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
  return { monthly: parts.reduce((s, p) => s + p.monthly, 0), parts };
}
