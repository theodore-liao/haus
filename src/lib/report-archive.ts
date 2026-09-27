import { matchesOwner, type OwnerFilter } from "./owners";

/**
 * Saved copies fill in charges Plaid has removed. A charge still on the ledger
 * is counted from that live row, so the id set has to include every account,
 * not only the ones in the current owner filter. A filter-scoped set treats a
 * reassigned account as removed and the previous owner's snapshot is added again.
 */
export function plaidIdsOnLedger(rows: { plaidTransactionId: string }[]) {
  return new Set(rows.map((row) => row.plaidTransactionId).filter(Boolean));
}

/** While the account is still linked, its current owner wins over the copy taken at archive time. */
export function savedOwnerNow(
  saved: { owner: string; accountId?: string | null },
  ownerByAccountId: ReadonlyMap<string, string>,
) {
  if (saved.accountId) {
    const current = ownerByAccountId.get(saved.accountId);
    if (current) return current;
  }
  return saved.owner;
}

export function savedChargeCounted(
  saved: { plaidTransactionId: string; owner: string },
  ledgerIds: ReadonlySet<string>,
  filter: OwnerFilter,
) {
  return matchesOwner(saved.owner, filter) && !ledgerIds.has(saved.plaidTransactionId);
}
