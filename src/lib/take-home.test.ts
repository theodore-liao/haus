import { test } from "node:test";
import assert from "node:assert/strict";
import { annualisedPaychecks, isTakeHome } from "./queries";

test("paychecks count as take-home pay under their display labels and raw categories", () => {
  assert.equal(isTakeHome("Salary"), true);
  assert.equal(isTakeHome("Paychecks"), true);
  assert.equal(isTakeHome("Income Wages"), true);
  assert.equal(isTakeHome("Interest"), false);
  assert.equal(isTakeHome("Income Interest Earned"), false);
  assert.equal(isTakeHome("Rental income"), false);
});

test("a bonus between regular paychecks does not drop that paycheck", () => {
  const pay = (date: string, amount: number) => ({ date, month: date.slice(0, 7), kind: "income" as const, category: "Salary", merchant: "Payroll", amount });
  const result = annualisedPaychecks([
    pay("2026-06-15", 3_000),
    pay("2026-06-30", 3_000),
    pay("2026-07-15", 3_000),
    pay("2026-07-31", 3_100),
    pay("2026-08-14", 3_000),
    pay("2026-08-31", 3_000),
    pay("2026-09-15", 25_000),
    pay("2026-09-30", 3_100),
  ]);
  const regular = result.sources.find((source) => source.amount < 5_000);
  assert.ok(regular);
  assert.equal(regular.cadence, "biweekly");
  assert.equal(regular.perYear, 26);
  assert.equal(result.sources.some((source) => source.amount > 10_000), false);
});
