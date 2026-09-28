import assert from "node:assert/strict";
import test from "node:test";
import { inferRecurring } from "./recurring";

function charge(date: string, amount: number, name = "Streamflix") {
  return { merchantName: name, userMerchant: null, name, amount, date: new Date(`${date}T00:00:00Z`), isTransfer: false, isCcPayment: false };
}

test("a monthly bill shows its latest charge, totals, and next date", () => {
  const [bill] = inferRecurring([charge("2026-06-05", 15.49), charge("2026-07-05", 15.49), charge("2026-08-05", 15.49)]);
  assert.equal(bill.cadence, "monthly");
  assert.equal(bill.amount, 15.49);
  assert.equal(bill.nextDate.slice(0, 10), "2026-09-05");
  assert.ok(Math.abs(bill.annual - 185.88) < 1e-9);
  assert.ok(Math.abs(bill.monthly - 15.49) < 1e-9);
  assert.equal(bill.priceChange, null);
});

test("a price increase on the latest charge is reported", () => {
  const [bill] = inferRecurring([charge("2026-06-05", 15.49), charge("2026-07-05", 15.49), charge("2026-08-05", 17.99)]);
  assert.deepEqual(bill.priceChange, { from: 15.49, to: 17.99 });
  assert.equal(bill.amount, 17.99);
});

test("cents of noise is not a price change", () => {
  const [bill] = inferRecurring([charge("2026-06-05", 80.1), charge("2026-07-05", 80.22), charge("2026-08-05", 80.41)]);
  assert.equal(bill.priceChange, null);
});

test("a weekly bill's monthly figure is a twelfth of its yearly cost", () => {
  const [bill] = inferRecurring([charge("2026-08-01", 10, "Gym"), charge("2026-08-08", 10, "Gym"), charge("2026-08-15", 10, "Gym")]);
  assert.equal(bill.cadence, "weekly");
  assert.equal(bill.annual, 520);
  assert.ok(Math.abs(bill.monthly - 520 / 12) < 1e-9);
});
