import assert from "node:assert/strict";
import test from "node:test";
import { isBrokerageDeposit, isContributionBuy, retirementDepositKind, retirementInflows, unmatchedDeposits } from "./outside-deposits";

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

test("a payroll contribution stays when a linked account spends the same amount that day", () => {
  const payroll = [{ id: "pay", date: "2026-09-15", amount: 2000, accountId: "401k", institution: "Plan" }];
  const plain = [{ id: "xfer", date: "2026-09-15", amount: 2000, accountId: "ira", institution: "Broker" }];
  const outflows = [{ date: "2026-09-15", amount: 2000, accountId: "checking" }];
  assert.deepEqual(
    retirementInflows(payroll, plain, outflows).map((d) => d.id),
    ["pay"],
  );
});

test("one outflow explains only one deposit", () => {
  const deposits = [
    { id: "a", date: "2026-09-02", amount: 1000, accountId: "rh", institution: "Broker" },
    { id: "b", date: "2026-09-03", amount: 1000, accountId: "rh", institution: "Broker" },
  ];
  assert.deepEqual(unmatchedDeposits(deposits, [{ date: "2026-09-02", amount: 1000, accountId: "checking" }]).map((d) => d.id), ["b"]);
});

test("the cash credit that funds an ESPP purchase is not an outside deposit", () => {
  assert.equal(isBrokerageDeposit({ type: "cash", subtype: "deposit", name: "ESPP PURCHASE CREDIT", amount: -7843 }), false);
  assert.equal(isBrokerageDeposit({ type: "cash", subtype: "deposit", name: "Stock Plan Deposit", amount: -2500 }), false);
});

test("payroll contributions are read from each plan's own wording", () => {
  const kind = (subtype: string, name: string, type = "cash", amount = -1307.28) => retirementDepositKind({ type, subtype, name, amount });
  assert.equal(kind("contribution", "VANG 500 INDEX TRUST - contribution"), "payroll");
  assert.equal(kind("deposit", "PARTIC CONTR CURRENT PARTICIPANT CUR YR (Cash)"), "payroll");
  assert.equal(kind("deposit", "CO CONTR CURRENT YR EMPLOYER CUR YR (Cash)"), "payroll");
  assert.equal(kind("deposit", "Employer Match"), "payroll");
  assert.equal(kind("deposit", "Payroll Deferral Pre-Tax"), "payroll");
  assert.equal(kind("transfer", "EMPLOYEE CONTRIB ROTH", "transfer"), "payroll");
});

test("plain deposits into a retirement account are left to the linked-account match", () => {
  assert.equal(
    retirementDepositKind({ type: "transfer", subtype: "transfer", name: "ACH deposit of $7500.00 into Traditional IRA", amount: -7500 }),
    "deposit",
  );
});

test("rollovers, conversions, gains, dividends, and money going out are not contributions", () => {
  const kind = (subtype: string, name: string, amount = -5000, type = "cash") => retirementDepositKind({ type, subtype, name, amount });
  assert.equal(kind("deposit", "VANG 500 IDX IS SEL - realizedGainLoss", -140767.2), null);
  assert.equal(kind("transfer", "Contribution from Robinhood Traditional IRA account ending in 9579", -7725, "transfer"), null);
  assert.equal(kind("deposit", "Direct Rollover from Prior Plan"), null);
  assert.equal(kind("contribution", "Roth Conversion"), null);
  assert.equal(kind("dividend", "Dividend Received", -120), null);
  assert.equal(kind("withdrawal", "Distribution", 594), null);
  assert.equal(kind("contribution", "Loan repayment contribution reversal"), null);
});

test("a contribution posted only as the fund it bought is a contribution buy", () => {
  assert.equal(isContributionBuy({ type: "buy", name: "S&P 500 INDEX - Employee Contribution", amount: 1136.68 }), true);
  assert.equal(isContributionBuy({ type: "buy", name: "S&P 500 INDEX - Dividend Reinvestment", amount: 12 }), false);
  assert.equal(isContributionBuy({ type: "buy", name: "YOU BOUGHT S&P 500 INDEX", amount: 1000 }), false);
});
