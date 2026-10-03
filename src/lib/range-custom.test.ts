import assert from "node:assert/strict";
import test from "node:test";
import { customBounds, customKey, inWindow } from "./range";
import { budgetMonths } from "./budget-window";
import { previousWindow } from "./spend-compare";

test("a custom window includes both of its days, whichever order they were picked in", () => {
  const key = customKey("2026-08-20", "2026-08-01");
  assert.equal(key, "custom:2026-08-01:2026-08-20");
  assert.equal(inWindow("2026-08-01T00:00:00.000Z", key), true);
  assert.equal(inWindow("2026-08-20", key), true);
  assert.equal(inWindow("2026-07-31", key), false);
  assert.equal(inWindow("2026-08-21", key), false);
  assert.equal(customBounds(key).days, 20);
});

test("a custom window budgets its share of the year and compares with the same number of days before", () => {
  const key = customKey("2026-07-01", "2026-08-14");
  assert.ok(Math.abs(budgetMonths(key, 1) - 45 / (365.25 / 12)) < 1e-9);
  const prev = previousWindow(key)!;
  assert.equal(prev.from, "2026-05-17");
  assert.equal(prev.to, "2026-07-01");
  assert.equal(prev.label, "the 45 days before");
});
