import assert from "node:assert/strict";
import test from "node:test";
import { classifyTransfers, merchantRefunds, type RefundTxn } from "./card-payments";

let seq = 0;
function txn(account: string, daysAgo: number, name: string, amount: number, primary: string, detailed: string, extra: Partial<RefundTxn> = {}): RefundTxn {
  return {
    id: `t${++seq}`,
    accountId: account,
    amount,
    date: new Date(Date.UTC(2026, 9, 23 - daysAgo)),
    name,
    merchantName: name,
    userMerchant: null,
    userCategory: null,
    categoryPrimary: primary,
    categoryDetailed: detailed,
    isTransfer: false,
    isCcPayment: false,
    ...extra,
  };
}

test("money back from a shop that charged the same card is a refund, whatever the bank filed it as", () => {
  const rows = [
    txn("card", 40, "Harbor Travel", 1240, "TRAVEL", "TRAVEL_FLIGHTS"),
    txn("card", 12, "Harbor Travel", -1240, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER", { isTransfer: true }),
    txn("card", 45, "Skyline Hotels", 890, "TRAVEL", "TRAVEL_LODGING"),
    txn("card", 15, "Skyline Hotels", -890, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", { isCcPayment: true }),
    txn("card", 55, "Metro Rail", 300, "TRANSPORTATION", "TRANSPORTATION_PUBLIC_TRANSIT"),
    txn("card", 20, "Metro Rail", -300, "INCOME", "INCOME_OTHER_INCOME"),
  ];
  const refunds = merchantRefunds(rows);
  assert.deepEqual([...refunds.entries()], [
    [rows[1].id, "TRAVEL"],
    [rows[3].id, "TRAVEL"],
    [rows[5].id, "TRANSPORTATION"],
  ]);
});

test("card payments, pay, payment apps, a chosen category, and credits with no earlier purchase stay as they are", () => {
  const rows = [
    // The card payment's merchant never charged the card.
    txn("card", 10, "Payment Thank You", -1650, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", { isCcPayment: true }),
    // Someone works where they shop: the paycheck is pay.
    txn("checking", 30, "Target", 85, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SUPERSTORES"),
    txn("checking", 14, "Target", -2100, "INCOME", "INCOME_WAGES"),
    // Venmo back from a friend is not a shop's refund.
    txn("checking", 25, "Venmo", 40, "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"),
    txn("checking", 5, "Venmo", -40, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER", { isTransfer: true }),
    // The household called this one a transfer.
    txn("card", 33, "Atlas Gear", 120, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SPORTING_GOODS"),
    txn("card", 3, "Atlas Gear", -120, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER", { isTransfer: true, userCategory: "TRANSFER" }),
    // A credit before the purchase, or from a shop that charged a different account, is not this kind of refund.
    txn("card", 50, "Northwind", -75, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER", { isTransfer: true }),
    txn("card", 40, "Northwind", 75, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE"),
    txn("checking", 9, "Lakeside Books", 30, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS"),
    txn("card", 2, "Lakeside Books", -30, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER", { isTransfer: true }),
  ];
  assert.equal(merchantRefunds(rows).size, 0);
});

test("a merchant repeated in the name and the merchant field is counted once", () => {
  // Banks often put the same merchant in both fields. Counting it twice would treat this credit as a refund.
  const rows = [
    txn("checking", 30, "Google", 2500, "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"),
    txn("checking", 14, "Google", -4200, "TRANSFER_IN", "TRANSFER_IN_DEPOSIT"),
  ];
  assert.equal(rows[0].merchantName, rows[0].name);
  assert.equal(merchantRefunds(rows).size, 0);
});

test("a credit bigger than everything bought there, or worded as pay, is not money back", () => {
  const rows = [
    // Works where they shop, and the bank filed the paycheck as a transfer in.
    txn("checking", 30, "Google", 2.99, "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"),
    txn("checking", 14, "Google", -4200, "TRANSFER_IN", "TRANSFER_IN_DEPOSIT"),
    txn("checking", 40, "Lumen Payroll", 15, "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"),
    txn("checking", 13, "Lumen Payroll", -10, "TRANSFER_IN", "TRANSFER_IN_DEPOSIT"),
    // Two purchases together cover one refund.
    txn("card", 60, "Atlas Gear", 300, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SPORTING_GOODS"),
    txn("card", 30, "Atlas Gear", 250, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SPORTING_GOODS"),
    txn("card", 4, "Atlas Gear", -500, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER", { isTransfer: true }),
  ];
  assert.deepEqual([...merchantRefunds(rows).keys()], [rows[6].id]);
});

test("a purchase more than 18 months back doesn't make a credit a refund", () => {
  const rows = [
    txn("card", 600, "Harbor Travel", 400, "TRAVEL", "TRAVEL_FLIGHTS"),
    txn("card", 1, "Harbor Travel", -400, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER", { isTransfer: true }),
  ];
  assert.equal(merchantRefunds(rows).size, 0);
});

test("a refund that lines up with an unrelated payment elsewhere is not paired as a transfer", () => {
  const rows = [
    txn("card", 50, "Harbor Airlines", 1200, "TRAVEL", "TRAVEL_FLIGHTS"),
    txn("card", 18, "Harbor Airlines", -1200, "TRAVEL", "TRAVEL_FLIGHTS"),
    txn("checking", 17, "Check 1042", 1200, "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"),
  ];
  // By amount alone the refund and the check pair up.
  assert.equal(classifyTransfers(rows).size, 2);
  const refunds = merchantRefunds(rows);
  assert.ok(refunds.has(rows[1].id));
  assert.equal(classifyTransfers(rows.filter((t) => !refunds.has(t.id))).size, 0);
});
