import { categoryLabel } from "./constants";
import { OTHER_CATEGORIES, TO_INVESTMENTS } from "./flow-labels";
import type { FlowEvent, MerchantLine } from "./merchant-lines";
import { otherCategoryLabels, SANKEY_INCOME_LIMIT, SANKEY_SPEND_LIMIT, sankeyIncomeLabel } from "./sankey-slices";
import type { FlowRow } from "./spend-net";
import type { TxnRow } from "./txn-row";

/** Same rows the transactions table stores, for one category in the open window. */
export function groupCategory(txns: TxnRow[], title: string): MerchantLine[] {
  return groupSpendLabels(txns, [title], title);
}

export function groupSpendLabels(txns: TxnRow[], titles: string[], dialogTitle: string): MerchantLine[] {
  const want = new Set(titles);
  const groups = new Map<string, TxnRow[]>();
  for (const t of txns) {
    if (t.internal || t.amount <= 0) continue;
    if (!want.has(categoryLabel(t.category))) continue;
    const list = groups.get(t.merchant) ?? [];
    list.push(t);
    groups.set(t.merchant, list);
  }
  return [...groups.entries()].map(([merchant, rows]) => ({
    category: dialogTitle,
    merchant,
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
    txns: rows,
  }));
}

function groupFlowTxns(title: string, flows: FlowRow[], txns: TxnRow[]): MerchantLine[] {
  const byId = new Map(txns.map((t) => [t.id, t]));
  const groups = new Map<string, { amount: number; rows: TxnRow[]; events: FlowEvent[]; logo?: string }>();
  for (const f of flows) {
    const txn = f.id ? byId.get(f.id) : undefined;
    const merchant = txn?.merchant || f.merchant || "Unknown";
    const g = groups.get(merchant) ?? { amount: 0, rows: [], events: [], logo: f.logo };
    if (!g.logo && f.logo) g.logo = f.logo;
    if (txn) {
      if (!g.rows.some((row) => row.id === txn.id)) {
        g.rows.push(txn);
        g.amount += Math.abs(txn.amount);
      }
    } else {
      const id = f.id ?? `${f.date}:${g.events.length}`;
      if (!g.events.some((event) => event.id === id)) {
        g.events.push({ id, date: f.date, amount: f.amount, ...(f.detail ? { detail: f.detail } : {}) });
        g.amount += f.amount;
      }
    }
    groups.set(merchant, g);
  }
  return [...groups.entries()].map(([merchant, g]) => ({
    category: title,
    merchant,
    amount: g.amount,
    ...(g.rows.length ? { txns: g.rows } : {}),
    ...(g.events.length ? { events: g.events } : {}),
    ...(g.logo ? { logo: g.logo } : {}),
  }));
}

/** Merchants that only exist on saved history, so the window still lists them. */
function mergeArchiveMerchants(live: MerchantLine[], flows: FlowRow[], title: string): MerchantLine[] {
  const have = new Set(live.map((l) => l.merchant));
  const extra = new Map<string, number>();
  for (const f of flows) {
    if (!f.merchant || have.has(f.merchant)) continue;
    extra.set(f.merchant, (extra.get(f.merchant) ?? 0) + f.amount);
  }
  return [...live, ...[...extra].map(([merchant, amount]) => ({ category: title, merchant, amount }))];
}

function spendFlowsFor(flows: FlowRow[], ranked: { label: string; value: number }[], title: string) {
  if (title === OTHER_CATEGORIES) {
    const labels = new Set(otherCategoryLabels(ranked, SANKEY_SPEND_LIMIT));
    return flows.filter((f) => f.kind === "spend" && labels.has(f.category));
  }
  return flows.filter((f) => f.kind === "spend" && f.category === title);
}

/** Spend bars use the same merchant rows as a donut slice of that category. */
export function groupSpendNode(
  txns: TxnRow[],
  flows: FlowRow[],
  ranked: { label: string; value: number }[],
  title: string,
): MerchantLine[] {
  const live =
    title === OTHER_CATEGORIES
      ? groupSpendLabels(txns, otherCategoryLabels(ranked, SANKEY_SPEND_LIMIT), title)
      : groupCategory(txns, title);
  return mergeArchiveMerchants(live, spendFlowsFor(flows, ranked, title), title);
}

/** Income bars follow the chart's source label, including the Other categories bucket. */
export function groupIncomeNode(
  txns: TxnRow[],
  flows: FlowRow[],
  ranked: { label: string; value: number }[],
  title: string,
): MerchantLine[] {
  const wanted =
    title === OTHER_CATEGORIES ? new Set(otherCategoryLabels(ranked, SANKEY_INCOME_LIMIT)) : null;
  const picked = flows.filter((f) => {
    if (f.kind !== "income") return false;
    if (wanted) return wanted.has(f.category);
    return sankeyIncomeLabel(f.category) === title;
  });
  return groupFlowTxns(title, picked, txns);
}

export function groupInvestNode(txns: TxnRow[], flows: FlowRow[]): MerchantLine[] {
  return groupFlowTxns(
    TO_INVESTMENTS,
    flows.filter((f) => f.kind === "invest"),
    txns,
  );
}
