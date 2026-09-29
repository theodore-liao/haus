import assert from "node:assert/strict";
import test from "node:test";
import { mustPayMonthly } from "./emergency-fund";

const now = new Date("2026-09-28T12:00:00Z");
const f = (category: string, amount: number, date = "2026-09-01", kind = "spend") => ({ kind, category, amount, date });

test("loan payments count toward the emergency-fund month, alongside essentials", () => {
  const r = mustPayMonthly([f("Loan payments", 9000), f("Groceries", 900), f("Rent and utilities", 600), f("Dining", 1200)], now);
  assert.equal(r.monthly, 3500);
  assert.deepEqual(r.parts.map((p) => p.category), ["Loan payments", "Groceries", "Rent and utilities"]);
});

test("only the last 90 days of spending count", () => {
  const r = mustPayMonthly([f("Loan payments", 3000, "2026-05-01"), f("Loan payments", 3000, "2026-09-01"), f("Loan payments", 3000, "2026-09-01", "income")], now);
  assert.equal(r.monthly, 1000);
});
