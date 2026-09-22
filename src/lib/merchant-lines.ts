import type { TxnRow } from "./txn-row";

export type MerchantLine = { category: string; merchant: string; amount: number; txns?: TxnRow[] };

export function aggregateMerchants(lines: MerchantLine[], category: string | null, extras?: string[]) {
  const allow = category == null ? null : new Set([category, ...(extras ?? [])]);
  const map: Record<string, number> = {};
  for (const l of lines) {
    if (allow && !allow.has(l.category)) continue;
    map[l.merchant] = (map[l.merchant] ?? 0) + l.amount;
  }
  return Object.entries(map).map(([merchant, amount]) => ({ category: category ?? "All", merchant, amount }));
}
