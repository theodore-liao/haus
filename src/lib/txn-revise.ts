import type { TxnSave } from "@/app/(office)/transactions/table";
import { effectiveCategory, isInternalMove, merchantKey } from "./categories";
import { categoryLabel } from "./constants";
import type { FlowRow } from "./spend-net";
import type { TxnRow } from "./txn-row";

function sameRule(t: TxnRow, patch: TxnSave) {
  if (t.id === patch.id) return true;
  if (!patch.applyToMerchant) return false;
  if ((t.cardMatch === "matched") !== (patch.cardMatch === "matched")) return false;
  const bases = new Set([patch.rawMerchant, patch.name, patch.merchant].map((x) => merchantKey(x)).filter(Boolean));
  return [t.rawMerchant, t.merchant, t.name].some((x) => bases.has(merchantKey(x)));
}

function reviseTxn(t: TxnRow, patch: TxnSave): TxnRow {
  const userMerchant = patch.merchant || null;
  const userCategory = patch.category;
  const fields = {
    userCategory,
    userMerchant,
    merchantName: t.rawMerchant,
    name: t.name,
    merchant: userMerchant || t.rawMerchant || t.name,
    pairedTransfer: t.cardMatch === "matched",
    isTransfer: t.isTransfer,
    isCcPayment: t.isCcPayment,
  };
  return {
    ...t,
    merchant: fields.merchant,
    category: effectiveCategory(fields),
    internal: isInternalMove(fields),
    memo: t.id === patch.id ? patch.memo : t.memo,
  };
}

export function reviseMatching(txns: TxnRow[], patch: TxnSave) {
  const revised = new Map<string, TxnRow>();
  for (const row of txns) {
    if (sameRule(row, patch)) revised.set(row.id, reviseTxn(row, patch));
  }
  return revised;
}

export function flowAfterRevision(flow: FlowRow, revised: Map<string, TxnRow>): FlowRow {
  const row = flow.id ? revised.get(flow.id) : undefined;
  if (!row) return flow;
  const code = (row.category ?? "").toUpperCase();
  const spend = row.amount > 0 && !row.internal && code !== "INCOME" && !code.startsWith("INCOME_");
  return {
    ...flow,
    merchant: row.merchant,
    kind: spend ? "spend" : "income",
    category: categoryLabel(row.category),
  };
}
