export type FlowRow = {
  id?: string;
  date: string;
  month: string;
  kind: "spend" | "income" | "invest";
  category: string;
  merchant: string;
  amount: number;
};

export function merchantKey(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Credits from a merchant that also has spend are treated as refunds. Never net spend below zero. */
export function applyMerchantRefunds(flows: FlowRow[]): FlowRow[] {
  const groups = new Map<string, FlowRow[]>();
  const unmatched: FlowRow[] = [];
  for (const f of flows) {
    if (f.kind === "invest") {
      unmatched.push(f);
      continue;
    }
    const key = merchantKey(f.merchant);
    if (!key) {
      unmatched.push(f);
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }
  const out: FlowRow[] = [...unmatched];
  for (const rows of groups.values()) {
    const spend = rows.filter((r) => r.kind === "spend");
    const income = rows.filter((r) => r.kind === "income");
    const spendSum = spend.reduce((s, r) => s + r.amount, 0);
    const incomeSum = income.reduce((s, r) => s + r.amount, 0);
    if (!(spendSum > 0 && incomeSum > 0)) {
      out.push(...rows);
      continue;
    }
    const refund = Math.min(spendSum, incomeSum);
    let left = refund;
    const spendNewest = [...spend].sort((a, b) => b.date.localeCompare(a.date));
    for (const s of spendNewest) {
      if (left <= 0) {
        out.push(s);
        continue;
      }
      const take = Math.min(s.amount, left);
      left -= take;
      const remain = s.amount - take;
      if (remain > 0.005) out.push({ ...s, amount: remain });
    }
    // Extra credit beyond spend stays off income and off spend (refunds list only).
  }
  return out;
}

export function refundPairs(flows: FlowRow[]) {
  const groups = new Map<string, { merchant: string; spend: number; credit: number }>();
  for (const f of flows) {
    if (f.kind === "invest") continue;
    const key = merchantKey(f.merchant);
    if (!key) continue;
    const cur = groups.get(key) ?? { merchant: f.merchant, spend: 0, credit: 0 };
    if (f.kind === "spend") cur.spend += f.amount;
    else cur.credit += f.amount;
    groups.set(key, cur);
  }
  return [...groups.values()]
    .filter((g) => g.spend > 0 && g.credit > 0)
    .map((g) => ({
      merchant: g.merchant,
      spend: g.spend,
      credit: g.credit,
      applied: Math.min(g.spend, g.credit),
      leftover: Math.max(0, g.credit - g.spend),
    }))
    .sort((a, b) => b.applied - a.applied);
}

export function aggregateFlows(rows: FlowRow[]) {
  const spendCats: Record<string, number> = {};
  const incomeCats: Record<string, number> = {};
  let invest = 0;
  for (const f of rows) {
    if (f.kind === "invest") invest += f.amount;
    else if (f.kind === "spend") spendCats[f.category] = (spendCats[f.category] ?? 0) + f.amount;
    else incomeCats[f.category] = (incomeCats[f.category] ?? 0) + f.amount;
  }
  const spendRows = Object.entries(spendCats)
    .map(([label, value]) => ({ label, value }))
    .filter((r) => r.value > 0.005)
    .sort((a, b) => b.value - a.value);
  const incomeRows = Object.entries(incomeCats)
    .map(([label, value]) => ({ label, value }))
    .filter((r) => r.value > 0.005)
    .sort((a, b) => b.value - a.value);
  return { spendRows, incomeRows, invest };
}
