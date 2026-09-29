import assert from "node:assert/strict";
import test from "node:test";
import { policyType, policyTypeLabel, shownPolicies, yearlyPremium } from "./insurance";

test("premiums scale to a year by how they are billed", () => {
  assert.equal(yearlyPremium({ premium: 96, billingFrequency: "monthly" }), 1152);
  assert.equal(yearlyPremium({ premium: 600, billingFrequency: "semiannual" }), 1200);
  assert.equal(yearlyPremium({ premium: 1850, billingFrequency: "annual" }), 1850);
  assert.equal(yearlyPremium({ premium: 1850, billingFrequency: null }), 1850);
  assert.equal(yearlyPremium({ premium: null, billingFrequency: "monthly" }), null);
});

test("other health images count when they belong to someone on the page", () => {
  const row = (id: string, type: string, owner: string) => ({
    id,
    type,
    owner,
    namedInsured: owner,
    coveredMembers: "[]",
    vehicleId: null,
  });
  const shown = shownPolicies(
    [row("medical", "health", "a"), row("note", "other", "a"), row("else", "other", "b")],
    ["a"],
    [],
  );
  assert.deepEqual(
    shown.map((p) => p.id),
    ["medical", "note"],
  );
});

test("vehicle cards read as auto policies", () => {
  assert.equal(policyType("vehicle"), "auto");
  assert.equal(policyTypeLabel("vehicle"), "Auto");
  assert.equal(policyType("something new"), "other");
});
