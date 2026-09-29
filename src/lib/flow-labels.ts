/** The Sankey's catch-all bar. A category that is itself called "Other" folds into it, so there is only one. */
export const OTHER_CATEGORIES = "Other";
/** Money back from shops (returns, credits) that didn't net against a charge in the window. */
export const REFUNDS = "Refunds";
export const FROM_SAVINGS = "From savings";
export const TO_SAVINGS = "To savings/investments";
export const TO_INVESTMENTS = "To investments";

export function isOtherSlice(key: string) {
  const n = key.trim().toLowerCase().replaceAll("_", " ");
  return n === "other" || n === "other categories";
}
