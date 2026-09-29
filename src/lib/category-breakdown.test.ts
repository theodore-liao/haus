import assert from "node:assert/strict";
import test from "node:test";
import { groupCategory, groupIncomeNode, groupInvestNode, groupSpendNode } from "./category-breakdown";
import { ESPP_LABEL, VEST_LABEL } from "./equity-comp";
import { OTHER_CATEGORIES, TO_INVESTMENTS } from "./flow-labels";
import { breakdownSummary, lineLabel } from "./merchant-lines";
import { RETIREMENT_CONTRIBUTION_LABEL } from "./outside-deposits";
import { otherCategoryLabels, SANKEY_SPEND_LIMIT } from "./sankey-slices";
import type { FlowRow } from "./spend-net";
import type { TxnRow } from "./txn-row";

function txn(over: Partial<TxnRow> & Pick<TxnRow, "id" | "merchant" | "amount">): TxnRow {
  return {
    date: "2026-09-01T00:00:00.000Z",
    name: over.merchant,
    rawMerchant: over.merchant,
    account: "Checking",
    accountMask: null,
    institution: null,
    owner: "a",
    ownerLabel: "A",
    category: "FOOD_AND_DRINK",
    categoryDetailed: null,
    pending: false,
    isTransfer: false,
    isCcPayment: false,
    internal: false,
    cardMatch: null,
    memo: null,
    ...over,
  };
}

test("groupCategory keeps charges for one category and attaches the transactions", () => {
  const rows = [
    txn({ id: "1", merchant: "Market", amount: 12, category: "GROCERIES" }),
    txn({ id: "2", merchant: "Market", amount: 8, category: "GROCERIES" }),
    txn({ id: "3", merchant: "Market", amount: -4, category: "GROCERIES" }),
    txn({ id: "4", merchant: "Rent", amount: 100, category: "RENT_AND_UTILITIES" }),
    txn({ id: "5", merchant: "Move", amount: 50, category: "TRANSFER_OUT", internal: true }),
  ];
  const lines = groupCategory(rows, "Groceries");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].merchant, "Market");
  assert.equal(lines[0].amount, 20);
  assert.deepEqual(lines[0].txns?.map((t) => t.id), ["1", "2"]);
});

test("other categories match the sankey bucket, including a small cash-back label", () => {
  const ranked = [
    { label: "A", value: 90 },
    { label: "B", value: 80 },
    { label: "C", value: 70 },
    { label: "D", value: 60 },
    { label: "E", value: 50 },
    { label: "F", value: 40 },
    { label: "G", value: 30 },
    { label: "H", value: 20 },
    { label: "I", value: 10 },
    { label: "Cash back", value: 1 },
  ];
  const other = otherCategoryLabels(ranked, SANKEY_SPEND_LIMIT);
  assert.equal(other.includes("Cash back"), false);
  assert.equal(other.includes("I"), true);
  assert.equal(other.includes("H"), true);
  const lines = groupSpendNode(
    [txn({ id: "i", merchant: "Shop", amount: 10, category: "I" })],
    [],
    ranked,
    OTHER_CATEGORIES,
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].txns?.[0].id, "i");
});

test("income click uses the chart label and keeps the transaction", () => {
  const flows: FlowRow[] = [
    { id: "pay", date: "2026-09-01", month: "2026-09", kind: "income", category: "Income", merchant: "Employer", amount: 1000 },
    { id: "div", date: "2026-09-02", month: "2026-09", kind: "income", category: "Dividends", merchant: "Broker", amount: 40 },
  ];
  const txns = [
    txn({ id: "pay", merchant: "Employer", amount: -1000, category: "INCOME" }),
    txn({ id: "div", merchant: "Broker", amount: -40, category: "INCOME_DIVIDENDS" }),
  ];
  const lines = groupIncomeNode(txns, flows, [{ label: "Income", value: 1000 }, { label: "Dividends", value: 40 }], "Other income");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].merchant, "Employer");
  assert.equal(lines[0].amount, 1000);
  assert.equal(lines[0].txns?.[0].id, "pay");
  assert.equal(lines[0].events, undefined);
});

test("vests, ESPP purchases, and retirement deposits expand to each date", () => {
  const flows: FlowRow[] = [
    { id: "v1", date: "2026-09-04", month: "2026-09", kind: "income", category: VEST_LABEL, merchant: `${VEST_LABEL}: Northline Holdings`, detail: "RSU VEST", amount: 4200 },
    { id: "v2", date: "2026-09-18", month: "2026-09", kind: "income", category: VEST_LABEL, merchant: `${VEST_LABEL}: Northline Holdings`, amount: 4100 },
    { id: "v3", date: "2026-08-20", month: "2026-08", kind: "income", category: VEST_LABEL, merchant: `${VEST_LABEL}: Northline Holdings`, amount: 4300 },
    { id: "e1", date: "2026-09-06", month: "2026-09", kind: "income", category: ESPP_LABEL, merchant: "ESPP: Northline Holdings", amount: 480 },
    { id: "espp-invest:e1", date: "2026-09-06", month: "2026-09", kind: "invest", category: "To investments", merchant: "ESPP: Northline Holdings", amount: 480 },
    { id: "retire:a", date: "2026-09-02", month: "2026-09", kind: "income", category: RETIREMENT_CONTRIBUTION_LABEL, merchant: "Crestview Retirement: Employer 401(k)", logo: "Crestview Retirement", detail: "VANG 500 INDEX TRUST - contribution", amount: 850 },
    { id: "retire:b", date: "2026-09-16", month: "2026-09", kind: "income", category: RETIREMENT_CONTRIBUTION_LABEL, merchant: "Crestview Retirement: Employer 401(k)", logo: "Crestview Retirement", amount: 850 },
    { id: "retire-invest:a", date: "2026-09-02", month: "2026-09", kind: "invest", category: "To investments", merchant: "Crestview Retirement: Employer 401(k)", amount: 850 },
    { id: "retire-invest:b", date: "2026-09-16", month: "2026-09", kind: "invest", category: "To investments", merchant: "Crestview Retirement: Employer 401(k)", amount: 850 },
  ];
  const ranked = [
    { label: VEST_LABEL, value: 12600 },
    { label: ESPP_LABEL, value: 480 },
    { label: RETIREMENT_CONTRIBUTION_LABEL, value: 1700 },
  ];
  const vests = groupIncomeNode([], flows, ranked, VEST_LABEL);
  assert.equal(vests.length, 1);
  assert.equal(vests[0].amount, 12600);
  assert.deepEqual(
    vests[0].events?.map((event) => event.date),
    ["2026-09-04", "2026-09-18", "2026-08-20"],
  );
  assert.equal(vests[0].events?.[0].detail, "RSU VEST");
  assert.equal(breakdownSummary(VEST_LABEL, vests), "3 vests");
  assert.deepEqual(lineLabel(vests[0]), { name: "Northline Holdings", mark: "Northline Holdings", kind: "security" });

  const espp = groupIncomeNode([], flows, ranked, ESPP_LABEL);
  assert.equal(espp.length, 1);
  assert.equal(espp[0].amount, 480);
  assert.deepEqual(espp[0].events?.map((event) => event.id), ["e1"]);
  assert.equal(breakdownSummary(ESPP_LABEL, espp), "1 purchase");

  const retirement = groupIncomeNode([], flows, ranked, RETIREMENT_CONTRIBUTION_LABEL);
  assert.equal(retirement.length, 1);
  assert.equal(retirement[0].logo, "Crestview Retirement");
  assert.equal(retirement[0].amount, 1700);
  assert.equal(retirement[0].events?.length, 2);
  assert.equal(retirement[0].events?.find((event) => event.id === "retire:a")?.detail, "VANG 500 INDEX TRUST - contribution");
  assert.equal(lineLabel(retirement[0]).name, "Employer 401(k)");
  assert.equal(lineLabel(retirement[0]).aside, "Crestview Retirement");

  const invested = groupInvestNode([], flows);
  assert.equal(invested.length, 2);
  const purchase = invested.find((line) => line.merchant.startsWith("ESPP:"));
  const plan = invested.find((line) => line.merchant.startsWith("Crestview"));
  assert.deepEqual(purchase?.events?.map((event) => event.id), ["espp-invest:e1"]);
  assert.equal(plan?.events?.length, 2);
  assert.equal(plan?.amount, 1700);
  assert.equal(breakdownSummary(TO_INVESTMENTS, invested), "2 accounts and stocks");
});
