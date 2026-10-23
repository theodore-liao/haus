// Keeps bank connections fresh while Haus runs, even when no one has it open: once an hour, if any connection that can
// still sync hasn't in a day, every connection is refreshed. Started once from instrumentation.ts.
import { prisma } from "./db";
import { plaidConfigured } from "./env";
import { syncAllItems } from "./plaid-sync";
import { connectionsStale } from "./refresh-plan";

/** A connection older than this is refreshed in the background. */
export const AUTO_SYNC_HOURS = 24;
const CHECK_MS = 60 * 60 * 1000;

const state = globalThis as unknown as { hausAutoSync?: boolean; hausAutoSyncAt?: number };

async function check() {
  // At most one background refresh a day, so a connection that can't update (a broken token) never sets off hourly syncs.
  if (state.hausAutoSyncAt && Date.now() - state.hausAutoSyncAt < AUTO_SYNC_HOURS * 3_600_000) return;
  const items = await prisma.plaidItem.findMany({ select: { status: true, lastSyncedAt: true } });
  if (!connectionsStale(items, AUTO_SYNC_HOURS)) return;
  state.hausAutoSyncAt = Date.now();
  await syncAllItems();
}

export function startAutoSync() {
  // Once per server, and only where banks can be reached (not the test households, which have no Plaid keys).
  if (state.hausAutoSync || !plaidConfigured() || process.env.HAUS_AUTO_SYNC === "off") return;
  state.hausAutoSync = true;
  const run = () => void check().catch((e) => console.error("Background bank refresh failed:", e instanceof Error ? e.message : e));
  // The first check waits a minute, so starting Haus stays quick.
  setTimeout(run, 60_000).unref();
  setInterval(run, CHECK_MS).unref();
}
