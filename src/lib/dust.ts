/** Entries worth less than this (in dollars, either sign) are clutter in a drill-down and stay hidden. */
export const DUST_USD = 1;

export function isDust(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && Math.abs(value) < DUST_USD;
}
