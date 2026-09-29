import assert from "node:assert/strict";
import test from "node:test";
import { policyType, policyTypeLabel, yearlyPremium } from "./insurance";

test("premiums scale to a year by how they are billed", () => {
  assert.equal(yearlyPremium({ premium: 96, billingFrequency: "monthly" }), 1152);
  assert.equal(yearlyPremium({ premium: 600, billingFrequency: "semiannual" }), 1200);
  assert.equal(yearlyPremium({ premium: 1850, billingFrequency: "annual" }), 1850);
  assert.equal(yearlyPremium({ premium: 1850, billingFrequency: null }), 1850);
  assert.equal(yearlyPremium({ premium: null, billingFrequency: "monthly" }), null);
});

test("vehicle cards read as auto policies", () => {
  assert.equal(policyType("vehicle"), "auto");
  assert.equal(policyTypeLabel("vehicle"), "Auto");
  assert.equal(policyType("something new"), "other");
});
