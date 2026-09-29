// One entry per symbol for Largest moves: the same coin or stock held in several places moves as one. Pure for tests.

type Move = { delta: number | null; pct: number | null };
type Mover = { id: string; symbol: string | null; value: number; day: Move; week: Move; month: Move };

function add(a: Move, b: Move, value: number): Move {
  if (a.delta == null && b.delta == null) return { delta: null, pct: null };
  const delta = (a.delta ?? 0) + (b.delta ?? 0);
  const start = value - delta;
  return { delta, pct: start > 0 ? (delta / start) * 100 : null };
}

/** Sums holdings of the same symbol; the percent is the combined move against the combined value before it. */
export function combineBySymbol<T extends Mover>(movers: T[]): T[] {
  const bySymbol = new Map<string, T>();
  const out: T[] = [];
  for (const m of movers) {
    const key = m.symbol?.trim().toUpperCase();
    if (!key) {
      out.push(m);
      continue;
    }
    const prev = bySymbol.get(key);
    if (!prev) {
      bySymbol.set(key, m);
      continue;
    }
    const value = prev.value + m.value;
    bySymbol.set(key, {
      ...prev,
      value,
      day: add(prev.day, m.day, value),
      week: add(prev.week, m.week, value),
      month: add(prev.month, m.month, value),
    });
  }
  return [...bySymbol.values(), ...out];
}
