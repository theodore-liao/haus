import assert from "node:assert/strict";
import test from "node:test";
import { defaultReportWindow, monthChip } from "./range";

const september = new Date(2026, 8, 29);

test("date chips open on the current month", () => {
  assert.equal(defaultReportWindow(september), "cal:2026-09");
  assert.equal(monthChip("current", september), "cal:2026-09");
});

test("the previous month is the one before", () => {
  assert.equal(monthChip("previous", september), "cal:2026-08");
});

test("january's previous month is december of the year before", () => {
  assert.equal(monthChip("previous", new Date(2026, 0, 2)), "cal:2025-12");
});
