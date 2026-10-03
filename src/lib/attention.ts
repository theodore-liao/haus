// What needs a look on Overview. Pure so it can be tested without a database.
import { storedYm, ymKey } from "./range";
import { aggregateFlows, applyMerchantRefunds, budgetFlows, merchantKey, type FlowRow } from "./spend-net";
import type { BudgetRow } from "./budget-window";
import { HIGH_UTILIZATION, INSURANCE_RENEWAL_DAYS, STALE_CONNECTION_HOURS } from "./constants";
import { policyTypeLabel } from "./insurance";

export type AttentionItem =
  | { kind: "relink"; key: string; name: string; message: string | null }
  | { kind: "stale"; key: string; name: string; lastSyncedAt: string }
  | { kind: "utilization"; key: string; name: string; balance: number; limit: number; pct: number }
  | { kind: "wallet"; key: string; name: string }
  | { kind: "budget"; key: string; category: string; spent: number; budget: number }
  | {
      kind: "charge";
      key: string;
      merchant: string;
      amount: number;
      date: string;
      /** Median of this merchant's earlier charges. Null for a merchant seen for the first time. */
      usual: number | null;
    }
  | { kind: "renewal"; key: string; label: string; date: string; days: number };

/** Charges from the last week are checked against what came before them. */
export const CHARGE_LOOKBACK_DAYS = 7;
/** A charge is unusual at this multiple of the merchant's median, and at least this many dollars above it. */
const UNUSUAL_MULTIPLE = 2;
const UNUSUAL_MIN_EXCESS = 100;
/** A first charge from a merchant is flagged when it is larger than this share of recent charges. */
const NEW_MERCHANT_PERCENTILE = 0.95;
const NEW_MERCHANT_MIN_SAMPLE = 20;
const MAX_CHARGES = 3;
export const RENEWAL_WINDOW_DAYS = INSURANCE_RENEWAL_DAYS;

const DAY_MS = 86_400_000;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function dayStart(date: string | Date) {
  const key = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  return Date.parse(`${key}T00:00:00Z`);
}

/** Categories whose spend this calendar month is already past their monthly budget. */
/** Every budget with what this month has spent against it, refunds netted the same way as Spending. */
export function budgetMonth(flows: FlowRow[], budgets: BudgetRow[], now = new Date()) {
  const month = ymKey(now);
  const netted = applyMerchantRefunds(budgetFlows(flows).filter((f) => storedYm(f.date) === month));
  const spent = new Map(aggregateFlows(netted).spendRows.map((r) => [r.label, r.value]));
  return budgets
    .filter((b) => b.monthly > 0)
    .map((b) => ({ category: b.category, spent: spent.get(b.category) ?? 0, budget: b.monthly }));
}

/** A single charge this big (share of the category's monthly budget) is a one-off and is not repeated in the estimate. */
const ONE_OFF_SHARE = 0.5;

export type BudgetOutlookRow = {
  category: string;
  spent: number;
  budget: number;
  /** Estimated spend by month end. */
  projected: number;
};

/**
 * Each budget with its month-end estimate: spent so far, plus the daily rate for the days left.
 * Single charges over half the budget count once and are left out of the daily rate.
 */
export function budgetOutlook(flows: FlowRow[], budgets: BudgetRow[], now = new Date()): BudgetOutlookRow[] {
  const month = ymKey(now);
  const netted = applyMerchantRefunds(budgetFlows(flows).filter((f) => storedYm(f.date) === month));
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate();
  const daysLeft = last - day;
  return budgetMonth(flows, budgets, now).map((r) => {
    const oneOff = netted
      .filter((f) => f.kind === "spend" && f.category === r.category && f.amount >= r.budget * ONE_OFF_SHARE)
      .reduce((s, f) => s + f.amount, 0);
    const rate = Math.max(0, r.spent - oneOff) / day;
    return { ...r, projected: r.spent + rate * daysLeft };
  });
}

export type BudgetSummary = {
  status: "on-track" | "over-pace" | "over";
  spent: number;
  budget: number;
  projected: number;
};

/** The month at a glance across the rows shown. Over once spend passes budget, over pace once the estimate does. */
export function summarizeBudget(rows: BudgetOutlookRow[]): BudgetSummary {
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  const budget = rows.reduce((s, r) => s + r.budget, 0);
  const projected = rows.reduce((s, r) => s + r.projected, 0);
  const status = spent > budget + 0.005 ? "over" : projected > budget + 0.005 ? "over-pace" : "on-track";
  return { status, spent, budget, projected };
}

export function overBudget(flows: FlowRow[], budgets: BudgetRow[], now = new Date()) {
  const month = ymKey(now);
  const netted = applyMerchantRefunds(budgetFlows(flows).filter((f) => storedYm(f.date) === month));
  const spent = new Map(aggregateFlows(netted).spendRows.map((r) => [r.label, r.value]));
  return budgets
    .filter((b) => b.monthly > 0 && (spent.get(b.category) ?? 0) > b.monthly + 0.005)
    .map((b) => ({ category: b.category, spent: spent.get(b.category) ?? 0, budget: b.monthly }))
    .sort((a, b) => b.spent - b.budget - (a.spent - a.budget));
}

/** Recent charges that are well above what the household usually pays that merchant. */
export function unusualCharges(flows: FlowRow[], now = new Date()) {
  const cutoff = dayStart(now) - CHARGE_LOOKBACK_DAYS * DAY_MS;
  const spend = flows.filter((f) => f.kind === "spend" && f.amount > 0);
  const recent = spend.filter((f) => dayStart(f.date) > cutoff);
  const earlier = spend.filter((f) => dayStart(f.date) <= cutoff);

  const history = new Map<string, number[]>();
  for (const f of earlier) {
    const key = merchantKey(f.merchant);
    if (!key) continue;
    const list = history.get(key) ?? [];
    list.push(f.amount);
    history.set(key, list);
  }
  const lastQuarter = earlier.filter((f) => dayStart(f.date) > cutoff - 90 * DAY_MS).map((f) => f.amount);
  const sorted = [...lastQuarter].sort((a, b) => a - b);
  const bigCharge =
    sorted.length >= NEW_MERCHANT_MIN_SAMPLE
      ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * NEW_MERCHANT_PERCENTILE))]
      : null;

  const out: { merchant: string; amount: number; date: string; usual: number | null; id?: string }[] = [];
  for (const f of recent) {
    const past = history.get(merchantKey(f.merchant)) ?? [];
    if (past.length >= 2) {
      const usual = median(past);
      if (f.amount >= usual * UNUSUAL_MULTIPLE && f.amount - usual >= UNUSUAL_MIN_EXCESS) {
        out.push({ merchant: f.merchant, amount: f.amount, date: f.date, usual, id: f.id });
      }
    } else if (past.length === 0 && bigCharge != null && f.amount > bigCharge && f.amount >= UNUSUAL_MIN_EXCESS) {
      out.push({ merchant: f.merchant, amount: f.amount, date: f.date, usual: null, id: f.id });
    }
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, MAX_CHARGES);
}

/** Policies that renew within the renewal window. */
export function upcomingRenewals(
  policies: { id: string; type: string; carrier: string; renewalDate: Date | null }[],
  now = new Date(),
) {
  const today = dayStart(now);
  return policies
    .filter((p) => p.renewalDate)
    .map((p) => {
      const days = Math.round((dayStart(p.renewalDate!) - today) / DAY_MS);
      return { id: p.id, type: p.type, carrier: p.carrier, date: p.renewalDate!.toISOString(), days };
    })
    .filter((p) => p.days >= 0 && p.days <= RENEWAL_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);
}

export function buildAttention(input: {
  items: { id: string; institutionName: string | null; status: string; errorMessage: string | null; lastSyncedAt?: Date | null }[];
  cards?: { id: string; name: string; balance: number | null; limit: number | null }[];
  wallets: { id: string; label: string | null; address: string; lastError: string | null }[];
  flows: FlowRow[];
  budgets: BudgetRow[];
  policies: { id: string; type: string; carrier: string; renewalDate: Date | null }[];
  now?: Date;
}): AttentionItem[] {
  const now = input.now ?? new Date();
  const out: AttentionItem[] = [];
  for (const item of input.items) {
    const name = item.institutionName ?? "A connection";
    if (item.status !== "good") {
      out.push({ kind: "relink", key: `relink:${item.id}`, name, message: item.errorMessage });
    } else if (item.lastSyncedAt && now.getTime() - item.lastSyncedAt.getTime() > STALE_CONNECTION_HOURS * 3_600_000) {
      out.push({ kind: "stale", key: `stale:${item.id}`, name, lastSyncedAt: item.lastSyncedAt.toISOString() });
    }
  }
  for (const w of input.wallets) {
    if (!w.lastError) continue;
    out.push({ kind: "wallet", key: `wallet:${w.id}`, name: w.label || `${w.address.slice(0, 6)}…` });
  }
  for (const c of input.cards ?? []) {
    if (!c.limit || c.limit <= 0) continue;
    const balance = Math.abs(c.balance ?? 0);
    const pct = balance / c.limit;
    if (pct >= HIGH_UTILIZATION) {
      out.push({ kind: "utilization", key: `utilization:${c.id}`, name: c.name, balance, limit: c.limit, pct });
    }
  }
  for (const b of overBudget(input.flows, input.budgets, now)) {
    out.push({ kind: "budget", key: `budget:${b.category}`, ...b });
  }
  for (const c of unusualCharges(input.flows, now)) {
    out.push({
      kind: "charge",
      key: `charge:${c.id ?? `${c.merchant}:${c.date}:${c.amount}`}`,
      merchant: c.merchant,
      amount: c.amount,
      date: c.date,
      usual: c.usual,
    });
  }
  for (const p of upcomingRenewals(input.policies, now)) {
    const kind = policyTypeLabel(p.type);
    const carrier = p.carrier && p.carrier !== "ID card" ? ` (${p.carrier})` : "";
    out.push({ kind: "renewal", key: `renewal:${p.id}`, label: `${kind} insurance${carrier}`, date: p.date, days: p.days });
  }
  return out;
}
