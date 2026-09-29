/** Which rows of a fixed-height list fall inside a scrollport, plus a few above and below. */
export function visibleSlice(offset: number, view: number, count: number, rowPx: number, overscan = 8) {
  if (count <= 0 || rowPx <= 0) return { start: 0, end: 0 };
  const top = Math.max(0, offset);
  const start = Math.max(0, Math.min(count, Math.floor(top / rowPx) - overscan));
  const end = Math.min(count, Math.ceil((top + Math.max(0, view)) / rowPx) + overscan);
  return { start: Math.min(start, end), end };
}
