// Summary figures for a list of holdings, and dividends. Pure for tests.

type Row = { symbol: string | null; name: string; value: number; costBasis: number | null; dayPl: number | null };

export type PortfolioSummary = {
  value: number;
  /** Sum of day moves over the holdings that have one. Null when none do. */
  day: number | null;
  dayPct: number | null;
  /** Cost and gain cover only holdings with a known cost. */
  cost: number | null;
  gain: number | null;
  gainPct: number | null;
  costed: number;
  count: number;
};

export function portfolioSummary(rows: Row[]): PortfolioSummary {
  const value = rows.reduce((s, r) => s + r.value, 0);
  const moved = rows.filter((r) => r.dayPl != null);
  const day = moved.length ? moved.reduce((s, r) => s + (r.dayPl as number), 0) : null;
  const before = day != null ? value - day : 0;
  const withCost = rows.filter((r) => r.costBasis != null && r.costBasis > 0);
  const cost = withCost.length ? withCost.reduce((s, r) => s + (r.costBasis as number), 0) : null;
  const gain = cost != null ? withCost.reduce((s, r) => s + r.value, 0) - cost : null;
  return {
    value,
    day,
    dayPct: day != null && before > 0 ? (day / before) * 100 : null,
    cost,
    gain,
    gainPct: gain != null && cost ? (gain / cost) * 100 : null,
    costed: withCost.length,
    count: rows.length,
  };
}

export function isDividend(t: { type: string; subtype: string | null; name: string }) {
  const blob = `${t.type} ${t.subtype ?? ""} ${t.name}`.toLowerCase();
  return blob.includes("dividend") && !blob.includes("reinvest");
}

/** Dividends paid this calendar year and over the last 12 months, and the trailing yield on today's value. */
export function dividendSummary(
  txns: { date: string; type: string; subtype: string | null; name: string; amount: number }[],
  marketValue: number,
  now = new Date(),
) {
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime();
  let ytd = 0;
  let trailing = 0;
  let count = 0;
  for (const t of txns) {
    if (!isDividend(t)) continue;
    const at = new Date(t.date).getTime();
    const paid = Math.abs(t.amount);
    if (at >= yearAgo && at <= now.getTime()) {
      trailing += paid;
      count += 1;
    }
    if (at >= yearStart && at <= now.getTime()) ytd += paid;
  }
  return {
    ytd,
    trailing,
    count,
    yieldPct: marketValue > 0 && trailing > 0 ? (trailing / marketValue) * 100 : null,
  };
}
