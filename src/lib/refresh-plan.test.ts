import assert from "node:assert/strict";
import test from "node:test";
import { connectionsStale, oldestSync, refreshPlan } from "./refresh-plan";

test("linked accounts without Plaid still refresh quotes instead of failing", () => {
  assert.equal(refreshPlan({ itemCount: 7, plaidReady: false, stale: true, force: false }), "local");
  assert.equal(refreshPlan({ itemCount: 7, plaidReady: false, stale: true, force: true }), "local");
});

test("a fresh Plaid household skips bank sync unless refresh is forced", () => {
  assert.equal(refreshPlan({ itemCount: 2, plaidReady: true, stale: false, force: false }), "skip");
  assert.equal(refreshPlan({ itemCount: 2, plaidReady: true, stale: false, force: true }), "sync");
  assert.equal(refreshPlan({ itemCount: 2, plaidReady: true, stale: true, force: false }), "sync");
});

test("a household with no linked institutions refreshes quotes only", () => {
  assert.equal(refreshPlan({ itemCount: 0, plaidReady: true, stale: true, force: true }), "local");
});

test("the oldest connection that can sync decides whether connections are stale", () => {
  const now = Date.UTC(2026, 9, 23, 12);
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000);
  const busy = { status: "good", lastSyncedAt: hoursAgo(1) };
  const quiet = { status: "good", lastSyncedAt: hoursAgo(30) };
  // One bank synced an hour ago; another hasn't in 30 hours, so it's time.
  assert.equal(connectionsStale([busy, quiet], 24, now), true);
  assert.equal(connectionsStale([busy], 24, now), false);
  // A connection waiting to be relinked can't sync, so it never makes the others refresh.
  assert.equal(connectionsStale([busy, { status: "relink", lastSyncedAt: hoursAgo(300) }], 24, now), false);
  // One that failed for a while still tries again.
  assert.equal(connectionsStale([busy, { status: "error", lastSyncedAt: hoursAgo(30) }], 24, now), true);
  assert.equal(connectionsStale([busy, { status: "good", lastSyncedAt: null }], 24, now), true);
  assert.equal(oldestSync([busy, quiet])?.getTime(), quiet.lastSyncedAt.getTime());
  assert.equal(oldestSync([busy, { status: "good", lastSyncedAt: null }]), null);
  assert.equal(oldestSync([{ status: "relink", lastSyncedAt: hoursAgo(300) }]), null);
});
