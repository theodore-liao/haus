import assert from "node:assert/strict";
import test from "node:test";
import { isBrokerageDeposit, unmatchedDeposits } from "./outside-deposits";

test("ACH deposits count as deposits; dividends, contributions, and internal transfers do not", () => {
  assert.equal(isBrokerageDeposit({ type: "transfer", subtype: "transfer", name: "ACH deposit of $1000 into Brokerage", amount: -1000 }), true);
  assert.equal(isBrokerageDeposit({ type: "cash", subtype: "deposit", name: "Deposit", amount: -500 }), true);
  assert.equal(isBrokerageDeposit({ type: "cash", subtype: "dividend", name: "Cash dividend of $18.94", amount: -18.94 }), false);
  assert.equal(isBrokerageDeposit({ type: "transfer", subtype: "transfer", name: "Contribution from Traditional IRA", amount: -7725 }), false);
  assert.equal(isBrokerageDeposit({ type: "transfer", subtype: "transfer", name: "Transfer from Savings account", amount: -3000 }), false);
  assert.equal(isBrokerageDeposit({ type: "transfer", subtype: "transfer", name: "ACH withdrawal", amount: 1000 }), false);
});

test("a deposit matched by money leaving a linked account is not outside money", () => {
  const deposits = [
    { id: "a", date: "2026-09-02", amount: 1000, accountId: "rh", institution: "Broker" },
    { id: "b", date: "2026-09-16", amount: 1000, accountId: "rh", institution: "Broker" },
    { id: "c", date: "2026-09-23", amount: 10000, accountId: "rh", institution: "Broker" },
  ];
  const outflows = [
    { date: "2026-09-22", amount: 10000, accountId: "checking" },
    { date: "2026-09-01", amount: 1000, accountId: "rh" },
  ];
  assert.deepEqual(unmatchedDeposits(deposits, outflows).map((d) => d.id), ["a", "b"]);
});

test("one outflow explains only one deposit", () => {
  const deposits = [
    { id: "a", date: "2026-09-02", amount: 1000, accountId: "rh", institution: "Broker" },
    { id: "b", date: "2026-09-03", amount: 1000, accountId: "rh", institution: "Broker" },
  ];
  assert.deepEqual(unmatchedDeposits(deposits, [{ date: "2026-09-02", amount: 1000, accountId: "checking" }]).map((d) => d.id), ["b"]);
});
