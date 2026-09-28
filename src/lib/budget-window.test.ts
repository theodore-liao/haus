import assert from "node:assert/strict";
import test from "node:test";
import { budgetStatus, monthElapsed } from "./budget-window";

const NOW = new Date("2026-09-15T12:00:00");

test("month elapsed is today's share of the open month, and only for that month", () => {
  assert.equal(monthElapsed("cal:2026-09", NOW), 0.5);
  assert.equal(monthElapsed("cal:2026-08", NOW), null);
  assert.equal(monthElapsed("3m", NOW), null);
});

test("budget status: over, ahead of pace, or fine", () => {
  assert.equal(budgetStatus(120, 100, 0.5), "over");
  assert.equal(budgetStatus(62, 100, 0.45), "ahead");
  assert.equal(budgetStatus(50, 100, 0.45), "ok");
  assert.equal(budgetStatus(90, 100, null), "ok");
  assert.equal(budgetStatus(100, 100, 0.5), "ahead");
  assert.equal(budgetStatus(100, 100, null), "ok");
});
