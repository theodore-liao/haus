import { test } from "node:test";
import assert from "node:assert/strict";
import { countable, expensesForPlan, MAX_EXPENSES, parseExpenses, plannedExpenses } from "./plan-expenses";

const at = { retireYear: 2050, currentYear: 2026, planAge: 36.4 };

test("a saved list keeps well-formed entries only, up to the most the planner holds", () => {
  const raw = [
    { id: "a", kind: "home", year: 2040, amount: 600_000 },
    { id: "b", kind: "yacht", year: 2030, amount: 1 },
    { id: "c", kind: "vehicle", year: "2030", amount: null },
    null,
    ...Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, kind: "other", year: 2030, amount: 1_000 })),
  ];
  const list = parseExpenses(raw)!;
  assert.equal(list.length, MAX_EXPENSES);
  assert.deepEqual(list.find((e) => e.id === "a"), { id: "a", kind: "home", year: 2040, amount: 600_000 });
  assert.deepEqual(list.find((e) => e.id === "c"), { id: "c", kind: "vehicle", year: null, amount: null });
  // In year order, blank years last.
  assert.deepEqual(list.map((e) => e.year), [...Array(10).fill(2030), 2040, null]);
  assert.equal(parseExpenses("nope"), undefined);
});

test("a plan from before the list keeps its house as the first entry, until the list is saved", () => {
  // Bought the year the household retires, so it follows the retire year.
  assert.deepEqual(plannedExpenses({ housePrice: 500_000 }, at), [{ id: "house", kind: "home", year: 2050, amount: 500_000 }]);
  assert.deepEqual(plannedExpenses({ housePrice: 500_000, houseAtRetire: true }, { ...at, retireYear: 2047 })[0].year, 2047);
  // Bought at a set age: that age's year.
  assert.equal(plannedExpenses({ housePrice: 500_000, houseAtRetire: false, houseAge: 45 }, at)[0].year, 2035);
  // Bought at an age never entered: listed, not counted.
  assert.equal(plannedExpenses({ housePrice: 500_000, houseAtRetire: false }, at)[0].year, null);
  assert.deepEqual(plannedExpenses({ housePrice: null }, at), []);
  // A saved list wins, even an empty one.
  assert.deepEqual(plannedExpenses({ housePrice: 500_000, expenses: [] }, at), []);
});

test("the plan counts entries with a cost and a year that hasn't passed, at the age they fall", () => {
  const list = [
    { id: "a", kind: "home" as const, year: 2040, amount: 600_000 },
    { id: "b", kind: "vehicle" as const, year: 2026, amount: 40_000 },
    { id: "c", kind: "travel" as const, year: 2025, amount: 9_000 },
    { id: "d", kind: "other" as const, year: null, amount: 9_000 },
    { id: "e", kind: "other" as const, year: 2030, amount: null },
  ];
  assert.deepEqual(expensesForPlan(list, at), [
    { age: 50, amount: 600_000 },
    { age: 36, amount: 40_000 },
  ]);
  assert.equal(countable(list[1], 2026), true);
  assert.equal(countable(list[2], 2026), false);
});
