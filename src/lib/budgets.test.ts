import assert from "node:assert/strict";
import test from "node:test";
import { budgetSeedAction } from "./budget-seed";
import type { FlowRow } from "./spend-net";

function spend(amount: number): FlowRow {
  const day = new Date();
  const month = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
  const date = `${month}-${String(day.getDate()).padStart(2, "0")}`;
  return { date, month, kind: "spend", category: "Dining", merchant: "Cafe", amount };
}

test("opening Spending before any charges does not lock zero budgets", () => {
  assert.equal(budgetSeedAction(false, [], []), "wait");
  assert.equal(budgetSeedAction(false, [], [{ ...spend(0), kind: "income", amount: 4000 }]), "wait");
});

test("the first visit that has spend writes the 3-month averages", () => {
  assert.equal(budgetSeedAction(false, [], [spend(90)]), "write");
});

test("an all-zero seed from an empty first visit is replaced once spend exists", () => {
  assert.equal(budgetSeedAction(true, [{ category: "Dining", monthly: 0 }], [spend(90)]), "write");
});

test("a budget the household already set is left alone", () => {
  assert.equal(budgetSeedAction(true, [{ category: "Dining", monthly: 40 }], [spend(90)]), "keep");
  assert.equal(budgetSeedAction(false, [{ category: "Dining", monthly: 40 }], [spend(90)]), "keep");
  assert.equal(budgetSeedAction(true, [], [spend(90)]), "keep");
});
