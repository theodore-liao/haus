import assert from "node:assert/strict";
import test from "node:test";
import { budgetOutlook, buildAttention, overBudget, summarizeBudget, unusualCharges, upcomingRenewals } from "./attention";
import type { FlowRow } from "./spend-net";

const NOW = new Date("2026-09-20T12:00:00");

function spend(date: string, merchant: string, amount: number, category = "Food and drink"): FlowRow {
  return { id: `${merchant}-${date}-${amount}`, date, month: date.slice(0, 7), kind: "spend", category, merchant, amount };
}

test("a category past its monthly budget this month is flagged, last month's spend is not", () => {
  const flows = [
    spend("2026-09-03", "Cafe", 300),
    spend("2026-09-10", "Cafe", 250),
    spend("2026-08-12", "Cafe", 900),
    spend("2026-09-04", "Store", 40, "Shopping"),
  ];
  const over = overBudget(flows, [
    { category: "Food and drink", monthly: 500 },
    { category: "Shopping", monthly: 100 },
  ], NOW);
  assert.deepEqual(over, [{ category: "Food and drink", spent: 550, budget: 500 }]);
});

test("a refund from the same merchant keeps a category under budget", () => {
  const flows: FlowRow[] = [
    spend("2026-09-03", "Store", 400, "Shopping"),
    { id: "r", date: "2026-09-05", month: "2026-09", kind: "income", category: "Shopping", merchant: "Store", amount: 350 },
  ];
  assert.deepEqual(overBudget(flows, [{ category: "Shopping", monthly: 100 }], NOW), []);
});

test("a charge well above the merchant's usual amount is unusual", () => {
  const flows = [
    spend("2026-06-01", "Power Co", 120),
    spend("2026-07-01", "Power Co", 130),
    spend("2026-08-01", "Power Co", 125),
    spend("2026-09-18", "Power Co", 410),
  ];
  const found = unusualCharges(flows, NOW);
  assert.equal(found.length, 1);
  assert.equal(found[0].amount, 410);
  assert.equal(found[0].usual, 125);
});

test("a normal charge, or a small bump, is not unusual", () => {
  const flows = [
    spend("2026-07-01", "Cafe", 10),
    spend("2026-08-01", "Cafe", 12),
    spend("2026-09-18", "Cafe", 30),
    spend("2026-06-01", "Power Co", 120),
    spend("2026-07-01", "Power Co", 130),
    spend("2026-09-18", "Power Co", 140),
  ];
  assert.deepEqual(unusualCharges(flows, NOW), []);
});

test("a first charge from a new merchant is flagged only when it is larger than almost every recent charge", () => {
  const flows: FlowRow[] = [];
  for (let i = 0; i < 30; i++) flows.push(spend(`2026-08-${String((i % 28) + 1).padStart(2, "0")}`, `Shop ${i}`, 20 + i));
  flows.push(spend("2026-09-17", "New Place", 1200));
  flows.push(spend("2026-09-17", "Other New", 25));
  const found = unusualCharges(flows, NOW);
  assert.deepEqual(found.map((f) => [f.merchant, f.usual]), [["New Place", null]]);
});

test("renewals in the next 60 days are listed soonest first; past and far ones are not", () => {
  const renewals = upcomingRenewals(
    [
      { id: "a", type: "home", carrier: "X", renewalDate: new Date("2026-10-15T00:00:00Z") },
      { id: "b", type: "auto", carrier: "Y", renewalDate: new Date("2026-09-25T00:00:00Z") },
      { id: "c", type: "life", carrier: "Z", renewalDate: new Date("2026-09-01T00:00:00Z") },
      { id: "d", type: "life", carrier: "Z", renewalDate: new Date("2026-12-01T00:00:00Z") },
      { id: "e", type: "life", carrier: "Z", renewalDate: null },
    ],
    NOW,
  );
  assert.deepEqual(renewals.map((r) => r.id), ["b", "a"]);
});

test("a healthy household has nothing to attend to", () => {
  const items = buildAttention({
    items: [{ id: "1", institutionName: "Bank", status: "good", errorMessage: null }],
    wallets: [{ id: "w", label: null, address: "0xabc", lastError: null }],
    flows: [spend("2026-09-03", "Cafe", 30)],
    budgets: [{ category: "Food and drink", monthly: 500 }],
    policies: [],
    now: NOW,
  });
  assert.deepEqual(items, []);
});

test("a broken connection comes first", () => {
  const items = buildAttention({
    items: [{ id: "1", institutionName: "Bank", status: "relink", errorMessage: "Login changed" }],
    wallets: [],
    flows: [spend("2026-09-03", "Cafe", 600)],
    budgets: [{ category: "Food and drink", monthly: 500 }],
    policies: [],
    now: NOW,
  });
  assert.deepEqual(items.map((i) => i.kind), ["relink", "budget"]);
});

test("a connection that has not synced in two days is stale; a card at 30% of its limit is flagged", () => {
  const items = buildAttention({
    items: [
      { id: "1", institutionName: "Bank", status: "good", errorMessage: null, lastSyncedAt: new Date("2026-09-17T12:00:00") },
      { id: "2", institutionName: "Fresh", status: "good", errorMessage: null, lastSyncedAt: new Date("2026-09-20T08:00:00") },
    ],
    cards: [
      { id: "c1", name: "Card", balance: -3000, limit: 10000 },
      { id: "c2", name: "Quiet card", balance: 200, limit: 10000 },
      { id: "c3", name: "No limit", balance: 900, limit: null },
    ],
    wallets: [],
    flows: [],
    budgets: [],
    policies: [],
    now: NOW,
  });
  assert.deepEqual(items.map((i) => i.key), ["stale:1", "utilization:c1"]);
});

test("month-end estimate repeats the daily rate but not a one-off large charge", () => {
  // Sept 20 of 30: 10 days left. 20 days of $10/day plus a $300 one-off against a $500 budget.
  const flows = [spend("2026-09-02", "Dentist", 300), spend("2026-09-05", "Cafe", 200)];
  const [row] = budgetOutlook(flows, [{ category: "Food and drink", monthly: 500 }], NOW);
  assert.equal(row.spent, 500);
  assert.equal(Math.round(row.projected), 600);
  assert.equal(summarizeBudget([row]).status, "over-pace");
  assert.equal(summarizeBudget([{ ...row, spent: 550 }]).status, "over");
  assert.equal(summarizeBudget([{ ...row, spent: 100, projected: 300 }]).status, "on-track");
});
