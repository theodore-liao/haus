// Stock pay that never touches a bank account: RSU vests and ESPP purchases arrive as investment
// transactions in the brokerage. Matching is by the wording brokers use, not by company.

export const EQUITY_VEST_CATEGORY = "EQUITY_VEST";
export const EQUITY_ESPP_CATEGORY = "EQUITY_ESPP";
/** Saved copies and report rows use this prefix so they never collide with a bank transaction id. */
export const EQUITY_ID_PREFIX = "inv:";
export const VEST_LABEL = "RSU vests";

const VEST_NAME = /conversion shares|\brsus?\b|restricted stock|stock award|stock plan|share (?:release|delivery)|\bvest(?:ed|ing)?\b/i;
const ESPP_NAME = /\bespp\b|employee stock purchase/i;
const NOT_VEST_TYPES = new Set(["sell", "cash", "fee", "cancel"]);

export type EquityKind = "vest" | "espp";

export type EquityEvent = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  kind: EquityKind;
  /** Dollars, always positive. Vests are net of shares withheld for tax. */
  amount: number;
  /** The security's name, for display. */
  security: string;
};

/** RSU vest or ESPP purchase, judged from one investment transaction. Null for everything else. */
export function equityKind(t: { type: string; name: string; quantity?: number | null; amount: number }): EquityKind | null {
  if (!(Math.abs(t.amount) > 0)) return null;
  const type = t.type.toLowerCase();
  if (ESPP_NAME.test(t.name) && type === "buy") return "espp";
  if (VEST_NAME.test(t.name) && (t.quantity ?? 0) > 0 && !NOT_VEST_TYPES.has(type)) return "vest";
  return null;
}

export function equityCategory(kind: EquityKind) {
  return kind === "vest" ? EQUITY_VEST_CATEGORY : EQUITY_ESPP_CATEGORY;
}

export function equityKindOfCategory(category: string | null | undefined): EquityKind | null {
  if (category === EQUITY_VEST_CATEGORY) return "vest";
  if (category === EQUITY_ESPP_CATEGORY) return "espp";
  return null;
}

export function isEquityId(id: string) {
  return id.startsWith(EQUITY_ID_PREFIX);
}

/** What a year of one kind of stock pay comes to, with the numbers behind it. */
export type EquityYear = {
  /** Sum over the window. */
  total: number;
  count: number;
  /** Months of history the total covers, at most 12. */
  months: number;
  /** total scaled to 12 months. */
  annual: number;
  monthly: number;
};

/**
 * Stock pay lands in lumps, so it is averaged over the last 12 months. When the linked history is
 * shorter than a year, the total is scaled up from the months it does cover.
 */
export function trailingYear(events: EquityEvent[], kind: EquityKind, now: Date, dataStart: string | null): EquityYear {
  const today = now.getTime();
  const from = today - 365 * 86_400_000;
  const rows = events.filter((e) => e.kind === kind && Date.parse(e.date) > from && Date.parse(e.date) <= today);
  const total = rows.reduce((s, e) => s + e.amount, 0);
  const covered = dataStart ? (today - Date.parse(dataStart)) / (30.4375 * 86_400_000) : 12;
  const months = Math.min(12, Math.max(1, Math.round(covered)));
  const annual = (total * 12) / months;
  return { total, count: rows.length, months, annual, monthly: annual / 12 };
}
