import assert from "node:assert/strict";
import test from "node:test";
import { refreshPlan } from "./refresh-plan";

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
