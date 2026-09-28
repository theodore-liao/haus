import { ymKey } from "./range";

export type MonthRow = { month: string; label: string; income: number; spend: number; savings: number };

/**
 * Adds the savings rate, spend against the same month a year earlier (when that month is on file),
 * and marks the best and lowest complete months by amount saved.
 */
export function withComparisons(months: MonthRow[], now = new Date()) {
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const current = ymKey(now);
  const complete = months.filter((m) => m.month < current);
  let best: string | null = null;
  let worst: string | null = null;
  if (complete.length >= 3) {
    best = complete.reduce((a, b) => (b.savings > a.savings ? b : a)).month;
    worst = complete.reduce((a, b) => (b.savings < a.savings ? b : a)).month;
  }
  return months.map((m) => {
    const [y, mm] = m.month.split("-");
    const lastYear = byMonth.get(`${Number(y) - 1}-${mm}`);
    const isCurrent = m.month === current;
    return {
      ...m,
      current: isCurrent,
      rate: m.income > 0 ? m.savings / m.income : null,
      spendVsLastYear:
        !isCurrent && lastYear && lastYear.spend > 0 ? (m.spend - lastYear.spend) / lastYear.spend : null,
      mark: m.month === best ? ("best" as const) : m.month === worst ? ("worst" as const) : null,
    };
  });
}
