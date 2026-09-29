import assert from "node:assert/strict";
import test from "node:test";
import { billKey, inferRecurring, type Cadence, type RecurringKind, type RecurringMark } from "./recurring";

const NOW = new Date("2026-09-20T12:00:00Z");

function charge(date: string, amount: number, name = "Streamflix", category: string | null = null) {
  return {
    merchantName: name,
    userMerchant: null,
    name,
    amount,
    date: new Date(`${date}T00:00:00Z`),
    isTransfer: false,
    isCcPayment: false,
    categoryPrimary: category,
  };
}

test("a monthly bill shows its latest charge, totals, and next date", () => {
  const [bill] = inferRecurring([charge("2026-06-05", 15.49), charge("2026-07-05", 15.49), charge("2026-08-05", 15.49)], new Set(), NOW);
  assert.equal(bill.cadence, "monthly");
  assert.equal(bill.kind, "subscription");
  assert.equal(bill.amount, 15.49);
  assert.equal(bill.nextDate.slice(0, 10), "2026-09-05");
  assert.ok(Math.abs(bill.annual - 185.88) < 1e-9);
  assert.equal(bill.priceChange, null);
});

test("a price change is reported, and cents of noise is not", () => {
  const [up] = inferRecurring([charge("2026-06-05", 15.49), charge("2026-07-05", 15.49), charge("2026-08-05", 17.99)], new Set(), NOW);
  assert.deepEqual(up.priceChange, { from: 15.49, to: 17.99 });
  const [noise] = inferRecurring([charge("2026-06-05", 80.1), charge("2026-07-05", 80.22), charge("2026-08-05", 80.41)], new Set(), NOW);
  assert.equal(noise.priceChange, null);
});

test("a weekly bill needs four charges, and its monthly figure is a twelfth of the year", () => {
  const gym = ["2026-08-22", "2026-08-29", "2026-09-05", "2026-09-12"].map((d) => charge(d, 10, "Gym"));
  const [bill] = inferRecurring(gym, new Set(), NOW);
  assert.equal(bill.cadence, "weekly");
  assert.equal(bill.annual, 520);
  assert.equal(inferRecurring(gym.slice(1), new Set(), NOW).length, 0);
});

test("repeat visits at uneven gaps are not recurring, even when they average a week", () => {
  const coffee = ["2026-07-06", "2026-07-06", "2026-07-08", "2026-07-30", "2026-08-05", "2026-08-15", "2026-08-19", "2026-09-09"].map((d) =>
    charge(d, 7.9, "Corner Coffee", "FOOD_AND_DRINK"),
  );
  const transit = ["2026-09-01", "2026-09-02", "2026-09-02", "2026-09-04", "2026-09-15"].map((d) => charge(d, 3, "Metro Fare", "TRANSPORTATION"));
  assert.equal(inferRecurring([...coffee, ...transit], new Set(), NOW).length, 0);
});

test("a stray charge after a steady run doesn't hide the subscription", () => {
  const [bill] = inferRecurring(
    [charge("2026-06-17", 9.9, "Chatbot"), charge("2026-07-17", 9.9, "Chatbot"), charge("2026-08-17", 9.9, "Chatbot"), charge("2026-09-10", 5, "Chatbot")],
    new Set(),
    NOW,
  );
  assert.equal(bill.cadence, "monthly");
  assert.equal(bill.amount, 9.9);
});

test("utility bills may vary, and a bill category is trusted from two charges on a steady rhythm", () => {
  const out = inferRecurring(
    [
      charge("2026-06-08", 85, "Cable Co", "RENT_AND_UTILITIES"),
      charge("2026-07-08", 125.55, "Cable Co", "RENT_AND_UTILITIES"),
      charge("2026-08-08", 125.55, "Cable Co", "RENT_AND_UTILITIES"),
      charge("2026-07-07", 266.52, "City Light", "RENT_AND_UTILITIES"),
      charge("2026-09-04", 321.38, "City Light", "RENT_AND_UTILITIES"),
    ],
    new Set(),
    NOW,
  );
  assert.deepEqual(out.map((b) => [b.label, b.cadence]).sort(), [
    ["Cable Co", "monthly"],
    ["City Light", "bimonthly"],
  ]);
});

test("two charges at a shop outside bill categories, or two that differ, are not enough", () => {
  const out = inferRecurring(
    [
      charge("2026-07-01", 40, "Bookshop", "GENERAL_MERCHANDISE"),
      charge("2026-08-01", 40, "Bookshop", "GENERAL_MERCHANDISE"),
      charge("2026-05-11", 11.71, "Charger", "GENERAL_SERVICES"),
      charge("2026-08-10", 8.97, "Charger", "GENERAL_SERVICES"),
    ],
    new Set(),
    NOW,
  );
  assert.equal(out.length, 0);
});

test("a subscription that stopped charging drops off", () => {
  const out = inferRecurring([charge("2026-05-17", 22), charge("2026-06-17", 22), charge("2026-07-17", 22)], new Set(), NOW);
  assert.equal(out.length, 0);
});

test("loan payments are their own kind, and a company suffix doesn't split one biller", () => {
  const out = inferRecurring(
    [
      charge("2026-06-16", 839.84, "Auto Lender", "LOAN_PAYMENTS"),
      charge("2026-07-16", 839.84, "Auto Lender", "LOAN_PAYMENTS"),
      charge("2026-08-17", 839.84, "Auto Lender", "LOAN_PAYMENTS"),
      charge("2026-06-16", 15.26, "Power Utility Inc", "RENT_AND_UTILITIES"),
      charge("2026-07-17", 15.31, "Power Utility Inc", "RENT_AND_UTILITIES"),
      charge("2026-08-15", 17.49, "Power Utility", "RENT_AND_UTILITIES"),
    ],
    new Set(),
    NOW,
  );
  assert.equal(out.find((b) => b.label === "Auto Lender")?.kind, "loan");
  const power = out.filter((b) => b.label.startsWith("Power Utility"));
  assert.equal(power.length, 1);
  assert.equal(power[0].label, "Power Utility");
});

test("utilities and insurance are bills; fixed-price services are subscriptions", () => {
  const out = inferRecurring(
    [
      charge("2026-06-08", 85, "Cable Co", "RENT_AND_UTILITIES"),
      charge("2026-07-08", 125.55, "Cable Co", "RENT_AND_UTILITIES"),
      charge("2026-08-08", 125.55, "Cable Co", "RENT_AND_UTILITIES"),
      charge("2026-06-27", 150.94, "Auto Insurance Payment", "GENERAL_SERVICES"),
      charge("2026-07-27", 150.94, "Auto Insurance Payment", "GENERAL_SERVICES"),
      charge("2026-08-27", 150.94, "Auto Insurance Payment", "GENERAL_SERVICES"),
      charge("2026-06-03", 2.2, "Cloud Storage", "GENERAL_SERVICES"),
      charge("2026-07-03", 2.2, "Cloud Storage", "GENERAL_SERVICES"),
      charge("2026-08-03", 2.2, "Cloud Storage", "GENERAL_SERVICES"),
    ],
    new Set(),
    NOW,
  );
  const kind = (label: string) => out.find((b) => b.label === label)?.kind;
  assert.equal(kind("Cable Co"), "bill");
  assert.equal(kind("Auto Insurance Payment"), "bill");
  assert.equal(kind("Cloud Storage"), "subscription");
});

test("a yearly bill in a bill category is found from two charges", () => {
  const [bill] = inferRecurring([charge("2025-01-10", 119.99, "Language App", "GENERAL_SERVICES"), charge("2026-01-11", 119.99, "Language App", "GENERAL_SERVICES")], new Set(), NOW);
  assert.equal(bill.cadence, "annual");
});

const mark = (name: string, kind: RecurringKind, cadence?: Cadence) =>
  new Map<string, RecurringMark>([[billKey(name), { kind, cadence }]]);

test("a merchant marked by hand is listed under the chosen kind even with one irregular charge", () => {
  const [bill] = inferRecurring([charge("2026-08-03", 40, "Tutor Co")], new Set(), NOW, mark("Tutor Co", "bill"));
  assert.equal(bill.kind, "bill");
  assert.equal(bill.manual, true);
  assert.equal(bill.amount, 40);
  assert.equal(bill.cadence, "monthly");
});

test("marked charges with an odd rhythm take the nearest cadence", () => {
  const [bill] = inferRecurring(
    [charge("2026-01-10", 90, "Gym Club"), charge("2026-04-14", 90, "Gym Club"), charge("2026-07-30", 120, "Gym Club")],
    new Set(),
    NOW,
    mark("Gym Club", "subscription"),
  );
  assert.equal(bill.cadence, "quarterly");
  assert.equal(bill.manual, true);
});

test("marking a detected bill changes its kind, and an unmarked merchant is left alone", () => {
  const rows = [charge("2026-06-05", 15.49), charge("2026-07-05", 15.49), charge("2026-08-05", 15.49)];
  const [bill] = inferRecurring(rows, new Set(), NOW, mark("Streamflix", "bill"));
  assert.equal(bill.kind, "bill");
  assert.equal(inferRecurring([charge("2026-08-03", 40, "Tutor Co")], new Set(), NOW, mark("Other", "bill")).length, 0);
});

test("a removed merchant stays removed even when marked", () => {
  const rows = [charge("2026-08-03", 40, "Tutor Co")];
  assert.equal(inferRecurring(rows, new Set(["tutor co"]), NOW, mark("Tutor Co", "bill")).length, 0);
});

test("a chosen cadence sets the yearly amount", () => {
  const [bill] = inferRecurring([charge("2026-08-03", 100, "Tutor Co")], new Set(), NOW, mark("Tutor Co", "bill", "quarterly"));
  assert.equal(bill.cadence, "quarterly");
  assert.equal(bill.annual, 400);
});

test("a merchant switched off stays off even when it repeats on a steady rhythm", () => {
  const rows = [charge("2026-06-05", 15.49), charge("2026-07-05", 15.49), charge("2026-08-05", 15.49)];
  const off = new Map<string, RecurringMark>([[billKey("Streamflix"), { off: true }]]);
  assert.equal(inferRecurring(rows, new Set(), NOW, off).length, 0);
});
