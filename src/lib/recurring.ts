// Bills inferred from repeat charges. Pure so it can be tested without a database.
import { addDays, addMonths, addYears } from "date-fns";
import { isInternalMove, recurringMerchantKey } from "./categories";

export type RecurringBill = {
  label: string;
  /** The latest charge. */
  amount: number;
  cadence: "weekly" | "biweekly" | "monthly" | "annual";
  lastDate: string;
  /** When the next charge should land, from the last one and the cadence. */
  nextDate: string;
  /** Latest charge × charges per year. */
  annual: number;
  /** Latest charge × charges per year ÷ 12. */
  monthly: number;
  /** Set when the latest charge differs from the one before it. */
  priceChange: { from: number; to: number } | null;
};

const PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, annual: 1 } as const;

/** A change this small is rounding or tax noise, not a new price. */
const PRICE_CHANGE_MIN_PCT = 0.02;
const PRICE_CHANGE_MIN_DOLLARS = 0.5;

function nextAfter(last: Date, cadence: RecurringBill["cadence"]) {
  if (cadence === "weekly") return addDays(last, 7);
  if (cadence === "biweekly") return addDays(last, 14);
  if (cadence === "monthly") return addMonths(last, 1);
  return addYears(last, 1);
}

export function inferRecurring(
  txns: {
    merchantName: string | null;
    userMerchant: string | null;
    name: string;
    amount: number;
    date: Date;
    isTransfer: boolean;
    isCcPayment: boolean;
    userCategory?: string | null;
    categoryPrimary?: string | null;
    categoryDetailed?: string | null;
  }[],
  ignored: Set<string> = new Set(),
): RecurringBill[] {
  const groups = new Map<string, { label: string; charges: { amount: number; date: Date }[] }>();
  for (const t of txns) {
    if (isInternalMove(t)) continue;
    if (t.amount <= 0) continue;
    const label = t.userMerchant || t.merchantName || t.name;
    const key = recurringMerchantKey(label);
    if (!key || ignored.has(key)) continue;
    const g = groups.get(key) ?? { label, charges: [] };
    g.charges.push({ amount: t.amount, date: t.date });
    groups.set(key, g);
  }
  const out: RecurringBill[] = [];
  for (const g of groups.values()) {
    if (g.charges.length < 3) continue;
    const sorted = [...g.charges].sort((a, b) => a.date.getTime() - b.date.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / 86400000);
    }
    const avgGap = gaps.reduce((s, x) => s + x, 0) / gaps.length;
    let cadence: RecurringBill["cadence"];
    if (avgGap >= 25 && avgGap <= 35) cadence = "monthly";
    else if (avgGap >= 6 && avgGap <= 8) cadence = "weekly";
    else if (avgGap >= 13 && avgGap <= 16) cadence = "biweekly";
    else if (avgGap >= 350 && avgGap <= 380) cadence = "annual";
    else continue;
    const amounts = sorted.map((c) => c.amount);
    const mean = amounts.reduce((s, x) => s + x, 0) / amounts.length;
    if (!amounts.every((a) => Math.abs(a - mean) / mean < 0.2)) continue;
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const diff = last.amount - prev.amount;
    const changed =
      Math.abs(diff) >= PRICE_CHANGE_MIN_DOLLARS && Math.abs(diff) / prev.amount >= PRICE_CHANGE_MIN_PCT;
    const perYear = PER_YEAR[cadence];
    out.push({
      label: g.label,
      amount: last.amount,
      cadence,
      lastDate: last.date.toISOString(),
      nextDate: nextAfter(last.date, cadence).toISOString(),
      annual: last.amount * perYear,
      monthly: (last.amount * perYear) / 12,
      priceChange: changed ? { from: prev.amount, to: last.amount } : null,
    });
  }
  return out.sort((a, b) => b.annual - a.annual);
}
