import assert from "node:assert/strict";
import test from "node:test";
import { startOfDay } from "./format";
import { fillMoverWindows, holdingPeriodMove } from "./period-moves";

const now = new Date(2026, 8, 28, 15);
function put(map: Map<string, number>, symbol: string, daysAgo: number, close: number) {
  const d = startOfDay(now);
  d.setDate(d.getDate() - daysAgo);
  map.set(`${symbol}|${d.toISOString()}`, close);
}

test("move is current quantity times price change", () => {
  const closes = new Map<string, number>();
  put(closes, "AAA", 7, 80);
  const m = holdingPeriodMove({ symbol: "AAA", value: 200, last: 100, days: 7, closes, now });
  assert.equal(m.delta, 40);
  assert.equal(m.pct, 25);
});

test("uses the nearest earlier close within tolerance", () => {
  const closes = new Map<string, number>();
  put(closes, "AAA", 10, 50);
  const m = holdingPeriodMove({ symbol: "AAA", value: 100, last: 100, days: 7, closes, now });
  assert.equal(m.delta, 50);
});

test("pegged coin and missing history read zero, never blank", () => {
  const closes = new Map<string, number>();
  assert.deepEqual(holdingPeriodMove({ symbol: "USDC", value: 500, last: 1, days: 30, closes, now }), { delta: 0, pct: 0 });
  assert.deepEqual(holdingPeriodMove({ symbol: "ZZZ", value: 500, last: 5, days: 30, closes, now }), { delta: 0, pct: 0 });
});

test("fill keeps existing figures and fills empty ones", () => {
  const closes = new Map<string, number>();
  put(closes, "AAA", 30, 50);
  const out = fillMoverWindows(
    [{ symbol: "AAA", value: 100, day: { delta: 1, pct: 1 }, week: { delta: null, pct: null }, month: { delta: null, pct: null } }],
    new Map([["AAA", 100]]),
    closes,
    now,
  );
  assert.equal(out[0].day.delta, 1);
  assert.equal(out[0].week.delta, 0);
  assert.equal(out[0].month.delta, 50);
});
