export function propertyDebt(
  p: { mortgageAccountId?: string | null; mortgageBalance?: number | null },
  accounts: { id: string; currentBalance: number | null }[],
) {
  if (p.mortgageAccountId) {
    const a = accounts.find((x) => x.id === p.mortgageAccountId);
    if (a) return Math.abs(a.currentBalance ?? 0);
  }
  return Math.max(0, p.mortgageBalance ?? 0);
}

export function vehicleDebt(v: { loanAccountId?: string | null; loanBalance?: number | null }, accounts: { id: string; currentBalance: number | null }[]) {
  if (v.loanAccountId) {
    const a = accounts.find((x) => x.id === v.loanAccountId);
    if (a) return Math.abs(a.currentBalance ?? 0);
  }
  return Math.max(0, v.loanBalance ?? 0);
}
