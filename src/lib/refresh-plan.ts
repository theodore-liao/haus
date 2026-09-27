export type RefreshPlan = "local" | "skip" | "sync";

/**
 * What a refresh is allowed to do.
 * Linked accounts with no Plaid credentials still refresh quotes. They do not fail the request.
 */
export function refreshPlan(input: {
  itemCount: number;
  plaidReady: boolean;
  stale: boolean;
  force: boolean;
}): RefreshPlan {
  if (input.itemCount === 0 || !input.plaidReady) return "local";
  if (!input.force && !input.stale) return "skip";
  return "sync";
}
