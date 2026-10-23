import assert from "node:assert/strict";
import test from "node:test";
import { addMonths, amortize, loanLife, monthlyPi } from "./amortization";

test("a loan's life is rebuilt from today's balance back to its first month, then on to payoff", () => {
  // $400,000 at 6% over 30 years, five years in.
  const pi = monthlyPi(400_000, 6, 360);
  const today = new Date(2026, 9, 15);
  const fromStart = amortize({ principal: 400_000, aprPct: 6, remainingMonths: 360 })!;
  const balance = fromStart.months[59].balance;
  const life = loanLife({ balance, aprPct: 6, pi, originationDate: addMonths(today, -60), today })!;
  assert.equal(life.todayIndex, 60);
  assert.ok(Math.abs(life.points[0].balance - 400_000) < 1, `started at ${life.points[0].balance}`);
  assert.equal(life.points[60].balance, balance);
  const paidSoFar = fromStart.months.slice(0, 60).reduce((s, m) => s + m.interest, 0);
  assert.ok(Math.abs(life.points[60].interestPaid - paidSoFar) < 1);
  assert.ok(Math.abs(life.points[60].principalPaid - (400_000 - balance)) < 1);
  // Paid off at the end of the original term, with all the principal paid.
  const last = life.points[life.points.length - 1];
  assert.ok(last.balance < 1);
  assert.ok(Math.abs(life.points.length - 361) <= 1);
  assert.ok(Math.abs(last.principalPaid - 400_000) < 1);
});

test("without a start date the chart starts today, and the original term stands in for the start", () => {
  const pi = monthlyPi(300_000, 5, 360);
  const today = new Date(2026, 9, 15);
  const plain = loanLife({ balance: 250_000, aprPct: 5, pi, today })!;
  assert.equal(plain.todayIndex, 0);
  assert.equal(plain.points[0].interestPaid, 0);
  const left = plain.points.length - 1;
  const fromTerm = loanLife({ balance: 250_000, aprPct: 5, pi, originalTermMonths: 360, today })!;
  assert.equal(fromTerm.todayIndex, 360 - left);
  // A start date in the future (a typo) is treated as today.
  assert.equal(loanLife({ balance: 250_000, aprPct: 5, pi, originationDate: addMonths(today, 12), today })!.todayIndex, 0);
});

test("a payment that doesn't cover the interest has no schedule to draw", () => {
  assert.equal(loanLife({ balance: 500_000, aprPct: 7, pi: 1_000 }), null);
});
