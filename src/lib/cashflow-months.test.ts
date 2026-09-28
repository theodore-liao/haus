import assert from "node:assert/strict";
import test from "node:test";
import { withComparisons, type MonthRow } from "./cashflow-months";

const NOW = new Date("2026-09-15T12:00:00");

function row(month: string, income: number, spend: number): MonthRow {
  return { month, label: month, income, spend, savings: income - spend };
}

test("spend is compared with the same month a year earlier only when that month is on file", () => {
  const out = withComparisons([row("2026-08", 5000, 3300), row("2026-07", 5000, 4000), row("2025-08", 5000, 3000)], NOW);
  const aug = out.find((m) => m.month === "2026-08")!;
  assert.ok(Math.abs(aug.spendVsLastYear! - 0.1) < 1e-9);
  assert.equal(out.find((m) => m.month === "2026-07")!.spendVsLastYear, null);
});

test("the open month is never best, lowest, or compared with last year", () => {
  const out = withComparisons(
    [row("2026-09", 9000, 100), row("2026-08", 5000, 4000), row("2026-07", 5000, 2000), row("2026-06", 5000, 3000), row("2025-09", 5000, 3000)],
    NOW,
  );
  const sep = out.find((m) => m.month === "2026-09")!;
  assert.equal(sep.current, true);
  assert.equal(sep.mark, null);
  assert.equal(sep.spendVsLastYear, null);
  assert.equal(out.find((m) => m.month === "2026-07")!.mark, "best");
  assert.equal(out.find((m) => m.month === "2026-08")!.mark, "worst");
});

test("best and lowest need at least three complete months; the rate needs income", () => {
  const out = withComparisons([row("2026-08", 0, 400), row("2026-07", 5000, 2000)], NOW);
  assert.ok(out.every((m) => m.mark == null));
  assert.equal(out[0].rate, null);
  assert.equal(out[1].rate, 0.6);
});
