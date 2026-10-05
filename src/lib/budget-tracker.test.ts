import assert from "node:assert/strict";
import test from "node:test";
import { budgetTracker, netStatus } from "./budget-tracker";
import type { FlowRow } from "./spend-net";

// September has 30 days, so the 15th is half the month.
const NOW = new Date("2026-09-15T12:00:00");

function spend(date: string, amount: number, category = "Food and drink"): FlowRow {
  return { id: `${category}-${date}-${amount}`, date, month: date.slice(0, 7), kind: "spend", category, merchant: "Shop", amount };
}

test("three months, this one judged against half its budget, net summed per category", () => {
  const flows = [spend("2026-07-10", 450), spend("2026-08-10", 560), spend("2026-09-05", 200), spend("2026-06-10", 999)];
  const t = budgetTracker(flows, [{ category: "Food and drink", monthly: 500 }], NOW);
  assert.deepEqual(
    t.months.map((m) => [m.ym, m.partial]),
    [
      ["2026-07", false],
      ["2026-08", false],
      ["2026-09", true],
    ],
  );
  const row = t.rows[0];
  assert.deepEqual(
    row.cells.map((c) => c.diff),
    [50, -60, 50],
  );
  assert.equal(row.net, 40);
  assert.equal(t.net, 40);
});

test("the furthest behind category comes first, and unbudgeted or zero budgets are left out", () => {
  const flows = [spend("2026-08-02", 300, "Shopping"), spend("2026-08-02", 100, "Travel")];
  const t = budgetTracker(
    flows,
    [
      { category: "Travel", monthly: 200 },
      { category: "Shopping", monthly: 100 },
      { category: "Gifts", monthly: 0 },
    ],
    NOW,
  );
  assert.deepEqual(
    t.rows.map((r) => r.category),
    ["Shopping", "Travel"],
  );
});

test("a charge left out of the budget doesn't count against it", () => {
  const flows = [spend("2026-09-05", 200), { ...spend("2026-09-06", 900), id: "big", noBudget: true }];
  const t = budgetTracker(flows, [{ category: "Food and drink", monthly: 500 }], NOW);
  assert.equal(t.rows[0].cells[2].spent, 200);
});

test("within a dollar is even", () => {
  assert.equal(netStatus(0.5), "even");
  assert.equal(netStatus(12), "ahead");
  assert.equal(netStatus(-12), "behind");
});
