import { test } from "node:test";
import assert from "node:assert/strict";
import { isTakeHome } from "./queries";

test("paychecks count as take-home pay under their display labels and raw categories", () => {
  assert.equal(isTakeHome("Salary"), true);
  assert.equal(isTakeHome("Paychecks"), true);
  assert.equal(isTakeHome("Income Wages"), true);
  assert.equal(isTakeHome("Interest"), false);
  assert.equal(isTakeHome("Income Interest Earned"), false);
  assert.equal(isTakeHome("Rental income"), false);
});
