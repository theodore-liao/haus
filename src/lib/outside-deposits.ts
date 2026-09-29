// Money that arrives in a brokerage from an account Haus can't see (a checking account that isn't linked).
// Nothing on the ledger shows it leaving, so without this it would be missing from income and from saving.

export const OUTSIDE_DEPOSIT_LABEL = "Deposits from unlinked accounts";

export type Deposit = { id: string; date: string; amount: number; accountId: string; institution: string };
export type Outflow = { date: string; amount: number; accountId: string };

const DAY = 86_400_000;

/** An investment-feed row that is cash arriving from outside the brokerage (not a dividend, sale, or internal move). */
export function isBrokerageDeposit(t: { type: string | null; subtype: string | null; name: string | null; amount: number }) {
  if (!(t.amount < 0)) return false;
  const type = (t.type ?? "").toLowerCase();
  const sub = (t.subtype ?? "").toLowerCase();
  const name = t.name ?? "";
  if (type !== "transfer" && type !== "cash") return false;
  if (/contribution|transfer from|from .* account|rollover|journal/i.test(name)) return false;
  return sub === "deposit" || /\bdeposit\b/i.test(name);
}

/**
 * Deposits with no matching outflow from another linked account: the same amount (within $1) leaving within
 * five days. Each outflow explains at most one deposit.
 */
export function unmatchedDeposits(deposits: Deposit[], outflows: Outflow[], windowDays = 5): Deposit[] {
  const used = new Set<number>();
  const out: Deposit[] = [];
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
