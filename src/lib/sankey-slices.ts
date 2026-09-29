import { OTHER_CATEGORIES, REFUNDS } from "./flow-labels";

export const SANKEY_INCOME_LIMIT = 7;
export const SANKEY_SPEND_LIMIT = 9;

/** Cash-back style labels and Refunds stay named even when they are small. */
function keepNamed(label: string) {
  return label === REFUNDS || /cash.?back|rewards|rebate/i.test(label);
}

/**
 * Largest slices, plus one Other bucket when the rest do not fit. A category already called "Other" never gets a
 * bar of its own next to the bucket: it goes into it, so the chart never shows two Others.
 */
export function topSlices(rows: { label: string; value: number }[], limit = 8) {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (sorted.length <= limit) return sorted;
  const own = sorted.filter((r) => r.label !== OTHER_CATEGORIES);
  const pinned = own.filter((r) => keepNamed(r.label));
  const rest = own.filter((r) => !keepNamed(r.label));
  const room = Math.max(1, limit - 1 - pinned.length);
  const head = [...rest.slice(0, room), ...pinned].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const named = new Set(head.map((r) => r.label));
  const leftover = sorted.filter((r) => !named.has(r.label)).reduce((s, r) => s + r.value, 0);
  if (leftover > 0) head.push({ label: OTHER_CATEGORIES, value: leftover });
  return head;
}

/** Category labels folded into the Other bar for this limit, a category called "Other" included. */
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
