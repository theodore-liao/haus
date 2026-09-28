import { OTHER_CATEGORIES } from "./flow-labels";

export const SANKEY_INCOME_LIMIT = 7;
export const SANKEY_SPEND_LIMIT = 9;

/** Cash-back style labels stay named even when they are small. */
function keepNamed(label: string) {
  return /cash.?back|rewards|rebate/i.test(label);
}

/** Largest slices, plus one Other categories bucket when the rest do not fit. */
export function topSlices(rows: { label: string; value: number }[], limit = 8) {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const pinned = sorted.filter((r) => keepNamed(r.label));
  const rest = sorted.filter((r) => !keepNamed(r.label));
  if (pinned.length + rest.length <= limit) return sorted;
  const room = Math.max(1, limit - 1 - pinned.length);
  const head = [...rest.slice(0, room), ...pinned].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const leftover = rest.slice(room).reduce((s, r) => s + r.value, 0);
  if (leftover > 0) head.push({ label: OTHER_CATEGORIES, value: leftover });
  return head;
}

/** Category labels folded into the Other categories bar for this limit. */
export function otherCategoryLabels(rows: { label: string; value: number }[], limit: number): string[] {
  const named = new Set(
    topSlices(rows, limit)
      .map((r) => r.label)
      .filter((label) => label !== OTHER_CATEGORIES),
  );
  return rows.filter((r) => r.value > 0 && !named.has(r.label)).map((r) => r.label);
}

/** The chart renames the generic Income source so it is not labelled twice. */
export function sankeyIncomeLabel(category: string) {
  return category === "Income" ? "Other income" : category;
}
