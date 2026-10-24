import { test } from "node:test";
import assert from "node:assert/strict";
import { isCreditCardPayment, isInternalMove } from "./categories";

test("a card payment is known by its flag, its wording, or Plaid's detailed category", () => {
  assert.equal(isCreditCardPayment({ isCcPayment: true, name: "Payment Thank You" }), true);
  assert.equal(isCreditCardPayment({ name: "ONLINE CREDIT CARD PAYMENT" }), true);
  // Saved without the flag: the category still says what it is, so it stays a move between accounts, not a refund.
  const payment = { name: "Payment Thank You", categoryPrimary: "LOAN_PAYMENTS", categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" };
  assert.equal(isCreditCardPayment(payment), true);
  assert.equal(isInternalMove(payment), true);
  assert.equal(isCreditCardPayment({ name: "Keystone Mortgage", categoryDetailed: "LOAN_PAYMENTS_MORTGAGE_PAYMENT" }), false);
});

test("money back from a shop stays spending in reverse, and a category the household chose wins", () => {
  const refund = { name: "Harbor Travel", isTransfer: true, categoryDetailed: "TRANSFER_IN_ACCOUNT_TRANSFER", refundOf: "TRAVEL" };
  assert.equal(isInternalMove(refund), false);
  assert.equal(isInternalMove({ name: "Payment Thank You", isCcPayment: true, userCategory: "SHOPPING" }), false);
});
