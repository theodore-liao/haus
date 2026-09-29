import assert from "node:assert/strict";
import test from "node:test";
import { incomeSourceLabel, savedUserCategory } from "./constants";

test("a saved transfer the household relabelled as income is still Salary", () => {
  const saved = { category: "INCOME", categoryDetailed: "TRANSFER_IN_ACCOUNT_TRANSFER" };
  const label = incomeSourceLabel({
    name: "Payroll deposit",
    merchantName: "Bank",
    categoryPrimary: saved.category,
    categoryDetailed: saved.categoryDetailed,
    userCategory: savedUserCategory(saved.category, saved.categoryDetailed),
  });
  assert.equal(label, "Salary");
});

test("a saved row Plaid already called income keeps Plaid's source", () => {
  assert.equal(savedUserCategory("INCOME", "INCOME_SALARY"), null);
  assert.equal(savedUserCategory("INCOME", "INCOME_INTEREST_EARNED"), null);
  assert.equal(savedUserCategory("GROCERIES", "TRANSFER_IN_ACCOUNT_TRANSFER"), null);
  assert.equal(savedUserCategory(null, null), null);
});
