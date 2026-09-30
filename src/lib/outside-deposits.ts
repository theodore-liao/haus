// Money that arrives in an investment account without passing through a linked bank: cash from a checking
// account that isn't linked, or pay sent straight from payroll into a 401(k), 403(b), or HSA. Nothing on the
// ledger shows it leaving, so without this it would be missing from income and from saving.

export const OUTSIDE_DEPOSIT_LABEL = "Deposits from unlinked accounts";

/** The one income source retirement money shows as in the cash flow chart. */
export const RETIREMENT_CONTRIBUTION_LABEL = "Retirement accounts";

export type Deposit = {
  id: string;
  date: string;
  amount: number;
  accountId: string;
  institution: string;
};

/** A retirement deposit. `institution` is the account's name as the Retirement tab shows it; `logo` is the bank to take the logo from. `detail` is the fund bought, or the plan's own word for the deposit. */
export type RetirementDeposit = Deposit & { logo?: string; detail?: string };
export type Outflow = { date: string; amount: number; accountId: string };

const DAY = 86_400_000;

// Wording for cash that is already inside the household: moves between accounts, rollovers, conversions, and
// what the account earns or books on its own (a fund exchange posts its gain as a "deposit" at some plans).
const NOT_NEW_MONEY =
  /rollover|roll over|transfer from|from .* account|journal|conver|rechar|gain|loss|exchange|dividend|interest|reinvest|adjust|revers|correct|distribution|refund|\bfee\b/i;
// Wording plans use for payroll money, the employee's share or the employer's match. Brokers differ
// ("contribution", "PARTIC CONTR", "EMPLOYER CONTRIB", "payroll deferral"), so this reads the words, not the plan.
const PAYROLL_WORDING = /\bcontr(?:ib(?:ution)?s?)?\b|payroll|employer|employee|deferral|\bmatch\b|salary/i;
// Stock-plan cash credits: the matching ESPP purchase is counted as income, so the cash leg is not.
const STOCK_PLAN_CASH = /\b[es]?spp\b|stock purchase|stock plan/i;

/** An investment-feed row that is cash arriving from outside the brokerage (not a dividend, sale, or internal move). */
export function isBrokerageDeposit(t: { type: string | null; subtype: string | null; name: string | null; amount: number }) {
  if (!(t.amount < 0)) return false;
  const type = (t.type ?? "").toLowerCase();
  const sub = (t.subtype ?? "").toLowerCase();
  const name = t.name ?? "";
  if (type !== "transfer" && type !== "cash") return false;
  if (/contribution|transfer from|from .* account|rollover|journal/i.test(name) || STOCK_PLAN_CASH.test(name)) return false;
  return sub === "deposit" || /\bdeposit\b/i.test(name);
}

/**
 * New money arriving in a retirement account. "payroll" when the plan's wording says it came from pay, so no
 * bank shows it leaving; "deposit" for plain cash in, which may have come from a linked bank. Null for
 * everything else, including rollovers, conversions, and gains a fund exchange books as cash.
 */
export function retirementDepositKind(t: {
  type: string | null;
  subtype: string | null;
  name: string | null;
  amount: number;
}): "payroll" | "deposit" | null {
  if (!(t.amount < 0)) return null;
  const type = (t.type ?? "").toLowerCase();
  const sub = (t.subtype ?? "").toLowerCase();
  const name = t.name ?? "";
  if (NOT_NEW_MONEY.test(name)) return null;
  if (type === "cash" || type === "transfer") {
    if (sub === "contribution" || PAYROLL_WORDING.test(name)) return "payroll";
    if (sub === "deposit" || /\bdeposit\b/i.test(name)) return "deposit";
  }
  return null;
}

/**
 * Some plans post a contribution only as the fund purchase it pays for. Those buys count, but only in an
 * account that reports no cash contributions of its own, so a plan that posts both is not counted twice.
 */
export function isContributionBuy(t: { type: string | null; name: string | null; amount: number }) {
  const name = t.name ?? "";
  return (t.type ?? "").toLowerCase() === "buy" && t.amount > 0 && PAYROLL_WORDING.test(name) && !NOT_NEW_MONEY.test(name);
}

/**
 * Deposits with no matching outflow from another linked account: the same amount (within $1) leaving within
 * five days. Each outflow explains at most one deposit.
 */
export function unmatchedDeposits<T extends Deposit>(deposits: T[], outflows: Outflow[], windowDays = 5): T[] {
  const used = new Set<number>();
  const out: T[] = [];
  const sorted = [...deposits].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of sorted) {
    const at = Date.parse(`${d.date}T00:00:00Z`);
    const hit = outflows.findIndex(
      (o, i) =>
        !used.has(i) &&
        o.accountId !== d.accountId &&
        Math.abs(o.amount - d.amount) <= 1 &&
        Math.abs(Date.parse(`${o.date}T00:00:00Z`) - at) <= windowDays * DAY,
    );
    if (hit >= 0) used.add(hit);
    else out.push(d);
  }
  return out;
}

/**
 * Payroll contributions always count: pay never shows leaving a bank. A same-sized bill must not hide them,
 * and must not use up the outflow that explains a real transfer. Plain deposits still need no match.
 */
export function retirementInflows<T extends Deposit>(payroll: T[], plain: T[], outflows: Outflow[], windowDays = 5): T[] {
  return [...payroll, ...unmatchedDeposits(plain, outflows, windowDays)];
}
