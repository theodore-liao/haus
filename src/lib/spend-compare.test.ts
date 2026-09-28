import assert from "node:assert/strict";
import test from "node:test";
import { categoryChanges, categoryTrend, previousWindow } from "./spend-compare";
import type { FlowRow } from "./spend-net";

const NOW = new Date("2026-09-20T12:00:00");

function spend(day: string, amount: number, category = "Food and drink", merchant = "Cafe"): FlowRow {
  return { id: `${day}-${merchant}-${amount}`, date: `${day}T00:00:00.000Z`, month: day.slice(0, 7), kind: "spend", category, merchant, amount };
}

test("the open month compares with the month before, up to the same day", () => {
  assert.deepEqual(previousWindow("cal:2026-09", NOW), { from: "2026-08-01", to: "2026-08-21", label: "Aug 1–20" });
});

test("a finished month compares with the whole month before", () => {
  assert.deepEqual(previousWindow("cal:2026-08", NOW), { from: "2026-07-01", to: "2026-08-01", label: "July" });
});

test("a rolling chip compares with the same length just before it; All has no comparison", () => {
  assert.deepEqual(previousWindow("3m", NOW), { from: "2026-03-20", to: "2026-06-20", label: "the 3 months before" });
  assert.equal(previousWindow("all", NOW), null);
});

test("category change is a fraction of the earlier spend, or new", () => {
  const flows = [spend("2026-07-01", 100), spend("2026-08-10", 150), spend("2026-08-12", 40, "Travel", "Air")];
  const out = categoryChanges(flows, [{ label: "Food and drink", value: 150 }, { label: "Travel", value: 40 }], "cal:2026-08", NOW)!;
  assert.equal(out.label, "July");
  assert.equal(out.changes.get("Food and drink"), 0.5);
  assert.equal(out.changes.get("Travel"), "new");
});

test("no comparison when stored history starts after the earlier window begins", () => {
  const flows = [spend("2026-07-15", 100), spend("2026-08-10", 150)];
  assert.equal(categoryChanges(flows, [{ label: "Food and drink", value: 150 }], "cal:2026-08", NOW), null);
});

test("the trend lists the recent months oldest first, with the open month partial", () => {
  const flows = [spend("2026-07-03", 100), spend("2026-08-03", 80), spend("2026-09-03", 20), spend("2026-09-04", 30, "Travel")];
  const trend = categoryTrend(flows, "Food and drink", null, NOW);
  assert.deepEqual(trend.map((p) => [p.month, p.value, p.partial]), [
    ["2026-07", 100, false],
    ["2026-08", 80, false],
    ["2026-09", 20, true],
  ]);
});
