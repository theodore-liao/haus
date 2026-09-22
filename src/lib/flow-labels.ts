export const OTHER_CATEGORIES = "Other categories";
export const FROM_SAVINGS = "From savings";
export const TO_SAVINGS = "To savings";
export const TO_INVESTMENTS = "To investments";

export function isOtherSlice(key: string) {
  const n = key.trim().toLowerCase().replaceAll("_", " ");
  return n === "other" || n === "other categories";
}
