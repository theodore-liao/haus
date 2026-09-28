import assert from "node:assert/strict";
import test from "node:test";
import { groupCategory, groupIncomeNode, groupSpendNode } from "./category-breakdown";
import { OTHER_CATEGORIES } from "./flow-labels";
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
});
