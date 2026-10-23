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

/**
 * Whether any connection that can still sync is older than `hours`: the oldest one decides, so one busy bank never
 * hides another that stopped refreshing. A connection waiting to be relinked can't sync, so it never makes this true.
 */
export function connectionsStale(items: { status: string; lastSyncedAt: Date | null }[], hours: number, now = Date.now()) {
  return items.some((i) => i.status !== "relink" && (!i.lastSyncedAt || now - i.lastSyncedAt.getTime() > hours * 3_600_000));
}

/** When the oldest connection that can sync last synced, for the page's own check. Null when one never has. */
export function oldestSync(items: { status: string; lastSyncedAt: Date | null }[]): Date | null {
  const syncable = items.filter((i) => i.status !== "relink");
  if (syncable.some((i) => !i.lastSyncedAt)) return null;
  return syncable.reduce<Date | null>((min, i) => (!min || i.lastSyncedAt! < min ? i.lastSyncedAt : min), null);
}
