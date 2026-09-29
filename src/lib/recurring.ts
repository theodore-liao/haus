// Bills inferred from charges that land on a steady rhythm. Pure so it can be tested without a database.
//
// A merchant is recurring only when its charges keep a set cadence (weekly, monthly, quarterly…), each gap within a
// small window of it. Visiting the same coffee shop often is not a bill: those gaps wander. The run must still be going
// (its last charge not long overdue), and amounts must hold steady, except utilities, whose bills vary month to month.
import { addDays, addMonths } from "date-fns";
import { isInternalMove, recurringMerchantKey } from "./categories";

export type RecurringKind = "loan" | "bill" | "subscription";

export type Cadence = "weekly" | "biweekly" | "monthly" | "bimonthly" | "quarterly" | "semiannual" | "annual";

export type RecurringBill = {
  label: string;
  /** The latest charge. */
  amount: number;
  cadence: Cadence;
  /**
   * loan: mortgage, car, student and other loan payments.
   * bill: essential services, often varying with use (utilities, phone and internet, insurance).
   * subscription: optional services at a set price (streaming, software, memberships).
   */
  kind: RecurringKind;
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

type Rhythm = { cadence: Cadence; days: number; min: number; max: number; months: number; perYear: number };

/** Each cadence with the gaps, in days, that still count as on time. */
const RHYTHMS: Rhythm[] = [
  { cadence: "weekly", days: 7, min: 6, max: 8, months: 0, perYear: 52 },
  { cadence: "biweekly", days: 14, min: 12, max: 16, months: 0, perYear: 26 },
  { cadence: "monthly", days: 30.44, min: 26, max: 35, months: 1, perYear: 12 },
  { cadence: "bimonthly", days: 60.9, min: 55, max: 67, months: 2, perYear: 6 },
  { cadence: "quarterly", days: 91.3, min: 84, max: 99, months: 3, perYear: 4 },
  { cadence: "semiannual", days: 182.6, min: 170, max: 196, months: 6, perYear: 2 },
  { cadence: "annual", days: 365.25, min: 350, max: 382, months: 12, perYear: 1 },
];

/** Categories whose bills can be trusted from two charges, since one-off spending there is rare. */
const BILL_CATEGORIES = /^(RENT_AND_UTILITIES|LOAN_PAYMENTS|GENERAL_SERVICES|INSURANCE|BANK_FEES)/;
/** Bills that vary with use. Their amounts may move a lot between charges. */
const VARIABLE_CATEGORIES = /^RENT_AND_UTILITIES/;
const LOAN = /LOAN|MORTGAGE/;
/** Essential services: utilities, phone and internet, insurance, rent. */
const BILL = /RENT_AND_UTILITIES|INSURANCE|TELECOM|INTERNET|CABLE|WATER|GAS_AND_ELECTRIC|SEWAGE|RENT\b/;
const BILL_NAME = /\b(insurance|insur|energy|electric|power|utilit|water|sewer|waste|gas|internet|wireless|mobile|telecom|cable)\b/i;

/** Loans by category; bills by category, name, or an amount that moves with use; everything else is a subscription. */
export function recurringKind(category: string, detailed: string, label: string, amounts: number[]): RecurringKind {
  if (LOAN.test(category) || LOAN.test(detailed)) return "loan";
  if (BILL.test(category) || BILL.test(detailed) || BILL_NAME.test(label)) return "bill";
  const typical = median(amounts);
  const varies = amounts.some((a) => Math.abs(a - typical) / typical > 0.1);
  return varies ? "bill" : "subscription";
}

/** A change this small is rounding or tax noise, not a new price. */
const PRICE_CHANGE_MIN_PCT = 0.02;
const PRICE_CHANGE_MIN_DOLLARS = 0.5;
/** How far a steady bill may drift from its typical charge; utilities get more room. */
const STEADY_SPREAD = 0.25;
const VARIABLE_SPREAD = 0.6;
/** Two charges are enough only for bill categories, and then they must match this closely (utilities excepted). */
const PAIR_SPREAD = 0.1;
/** A run is still going when its next charge is at most this many cadences late. */
const OVERDUE_CADENCES = 0.5;
const OVERDUE_GRACE_DAYS = 10;

type Charge = { amount: number; date: Date };

/** Shared words that make one merchant look like two: "Puget Sound Energy Inc" and "Puget Sound Energy". */
export function billKey(label: string) {
  return recurringMerchantKey(label)
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|pbc|plc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function nextAfter(last: Date, r: Rhythm) {
  return r.months ? addMonths(last, r.months) : addDays(last, r.days);
}

/**
 * Unbroken runs of charges on one rhythm, newest first: every gap inside a run fits the cadence. A charge on the
 * same day as the one before is a break, so a string of visits never passes for a bill.
 */
function runsOf(sorted: Charge[], r: Rhythm): Charge[][] {
  const runs: Charge[][] = [];
  let run: Charge[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / 86_400_000;
    if (gap >= r.min && gap <= r.max) run.push(sorted[i]);
    else {
      runs.push(run);
      run = [sorted[i]];
    }
  }
  runs.push(run);
  return runs.reverse();
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
  now = new Date(),
): RecurringBill[] {
  const groups = new Map<string, { label: string; category: string; detailed: string; latest: Date; charges: Charge[] }>();
  for (const t of txns) {
    if (isInternalMove(t)) continue;
    if (t.amount <= 0) continue;
    const label = t.userMerchant || t.merchantName || t.name;
    if (!recurringMerchantKey(label) || ignored.has(recurringMerchantKey(label))) continue;
    const key = billKey(label);
    if (!key) continue;
    const category = (t.userCategory || t.categoryPrimary || "").toUpperCase();
    const g = groups.get(key) ?? { label, category, detailed: "", latest: t.date, charges: [] };
    g.charges.push({ amount: t.amount, date: t.date });
    // The newest charge names the bill and sets its category.
    if (t.date >= g.latest) {
      g.latest = t.date;
      g.label = label;
      g.category = category;
      g.detailed = (t.categoryDetailed || "").toUpperCase();
    }
    groups.set(key, g);
  }

  const out: RecurringBill[] = [];
  for (const g of groups.values()) {
    if (g.charges.length < 2) continue;
    const sorted = [...g.charges].sort((a, b) => a.date.getTime() - b.date.getTime());
    const bill = BILL_CATEGORIES.test(g.category);
    const variable = VARIABLE_CATEGORIES.test(g.category);
    let found: { run: Charge[]; rhythm: Rhythm } | null = null;
    for (const r of RHYTHMS) {
      const need = bill ? 2 : r.cadence === "weekly" ? 4 : 3;
      // The newest run that still holds. A stray charge after it (a plan change, a one-off) doesn't hide it.
      const run = runsOf(sorted, r).find((run) => {
        if (run.length < need) return false;
        const typical = median(run.map((c) => c.amount));
        const spread = run.length === 2 && !variable ? PAIR_SPREAD : variable ? VARIABLE_SPREAD : STEADY_SPREAD;
        if (!run.every((c) => Math.abs(c.amount - typical) / typical <= spread)) return false;
        const overdueBy = (now.getTime() - nextAfter(run[run.length - 1].date, r).getTime()) / 86_400_000;
        return overdueBy <= r.days * OVERDUE_CADENCES + OVERDUE_GRACE_DAYS;
      });
      // Prefer the longest run across cadences; on a tie the shorter cadence, which is tried first.
      if (run && (!found || run.length > found.run.length)) found = { run, rhythm: r };
    }
    if (!found) continue;
    const { run, rhythm } = found;
    const last = run[run.length - 1];
    const prev = run[run.length - 2];
    const diff = last.amount - prev.amount;
    const changed = Math.abs(diff) >= PRICE_CHANGE_MIN_DOLLARS && Math.abs(diff) / prev.amount >= PRICE_CHANGE_MIN_PCT;
    out.push({
      label: g.label,
      amount: last.amount,
      cadence: rhythm.cadence,
      kind: recurringKind(g.category, g.detailed, g.label, run.map((c) => c.amount)),
      lastDate: last.date.toISOString(),
      nextDate: nextAfter(last.date, rhythm).toISOString(),
      annual: last.amount * rhythm.perYear,
      monthly: (last.amount * rhythm.perYear) / 12,
      priceChange: changed ? { from: prev.amount, to: last.amount } : null,
    });
  }
  return out.sort((a, b) => b.annual - a.annual);
}
