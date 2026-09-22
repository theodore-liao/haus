/** One palette for every donut. Spend labels keep a fixed swatch so a new category never recolors the rest. */
const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "#7EABD4",
  Dining: "#D4928C",
  Shopping: "#7DB8A4",
  "General merchandise": "#7DB8A4",
  Entertainment: "#D4BE7A",
  Transportation: "#A898CC",
  Travel: "#78C0C4",
  "Rent and utilities": "#D4A878",
  "Home improvement": "#D49AB0",
  Medical: "#94C48C",
  "Personal care": "#8EA4DC",
  "General services": "#C4A898",
  "Loan payments": "#7CBCB0",
  "Bank fees": "#C8C47A",
  "Government and non-profit": "#86B8D4",
  Transfer: "#C49AC4",
  Income: "#E0A898",
  Other: "#88C4A8",
  "Other categories": "#88C4A8",
  Uncategorized: "#D4B85C",
  Paychecks: "#2A9A72",
  Salary: "#E2B15A",
  "Other income": "#E08A5A",
  Dividends: "#3AABBE",
  Interest: "#6E8FC7",
  "Retirement income": "#D4C888",
  "Tax refund": "#7AB4D4",
  Unemployment: "#7EABD4",
  "Child support": "#D4928C",
  "Rental income": "#7DB8A4",
  "To savings": "#6FC4B0",
  "From savings": "#D48992",
  "To investments": "#8EA4DC",
  // Allocation and holding-class slices, same opening colors as the spend ring.
  Stocks: "#7EABD4",
  Equity: "#7EABD4",
  Crypto: "#D4928C",
  Cryptocurrency: "#D4928C",
  Cash: "#7DB8A4",
  Retirement: "#D4BE7A",
  "Real estate": "#A898CC",
  Vehicles: "#78C0C4",
  "Child accounts": "#D4A878",
  ETF: "#D4928C",
  "Mutual Fund": "#7DB8A4",
  Derivative: "#A898CC",
  Loan: "#7CBCB0",
  "Fixed Income": "#D4BE7A",
  DeFi: "#78C0C4",
};

const PALETTE = [
  "#7EABD4",
  "#D4928C",
  "#7DB8A4",
  "#D4BE7A",
  "#A898CC",
  "#78C0C4",
  "#D4A878",
  "#D49AB0",
  "#94C48C",
  "#8EA4DC",
  "#C4A898",
  "#7CBCB0",
  "#C8C47A",
  "#86B8D4",
  "#C49AC4",
  "#E0A898",
  "#88C4A8",
  "#D4B85C",
  "#9A9AD0",
  "#E0B07A",
  "#70C4BC",
  "#B8A0D0",
  "#D4C888",
  "#7AB4D4",
];

function canon(name: string) {
  return name.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

const BY_CANON = new Map<string, string>();
for (const [name, hex] of Object.entries(CATEGORY_COLORS)) BY_CANON.set(canon(name), hex);

function lookup(name: string) {
  return BY_CANON.get(canon(name));
}

export function colorFor(name: string) {
  return lookup(name) ?? paletteAt(name);
}

function paletteAt(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Colors for one donut. Named slices keep their swatch. Anything else takes the
 * next spend-palette color, in name order, so account and class rings use the
 * same colors as the spend ring instead of a scrambled hash.
 */
export function donutColorMap(keys: string[]) {
  const map = new Map<string, string>();
  const taken = new Set<string>();
  const unknown: string[] = [];
  for (const key of keys) {
    const fixed = lookup(key);
    if (fixed) {
      map.set(key, fixed);
      taken.add(fixed);
    } else unknown.push(key);
  }
  unknown.sort((a, b) => a.localeCompare(b));
  let i = 0;
  for (const key of unknown) {
    let color = PALETTE[i % PALETTE.length];
    let guard = 0;
    while (taken.has(color) && guard < PALETTE.length) {
      i += 1;
      guard += 1;
      color = PALETTE[i % PALETTE.length];
    }
    map.set(key, color);
    taken.add(color);
    i += 1;
  }
  return map;
}
