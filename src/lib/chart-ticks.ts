/** Round axis steps from zero: 1, 2, 2.5, or 5 times a power of ten, enough to reach `max`. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((m) => m >= raw) ?? 10 * power;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** Year ticks on whole multiples of a round step (every 1, 2, 5, or 10 years), within the years shown. */
export function yearTicks(from: number, to: number): number[] {
  const span = to - from;
  const step = span <= 6 ? 1 : span <= 12 ? 2 : span <= 40 ? 5 : 10;
  const first = Math.ceil(from / step) * step;
  return Array.from({ length: Math.max(0, Math.floor((to - first) / step) + 1) }, (_, i) => first + i * step);
}
