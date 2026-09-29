import assert from "node:assert/strict";
import test from "node:test";
import { holdingsPath, lastDays } from "./sparkline";

const now = new Date("2026-09-28T12:00:00Z");

test("the last 30 days start at the window's edge and report the change", () => {
  const pts = [
    { date: "2026-07-01T00:00:00.000Z", value: 50 },
    { date: "2026-08-25T00:00:00.000Z", value: 100 },
    { date: "2026-09-10T00:00:00.000Z", value: 110 },
    { date: "2026-09-28T00:00:00.000Z", value: 120 },
  ];
  const r = lastDays(pts, 30, now);
  assert.equal(r.points[0].value, 100);
  assert.equal(r.change, 20);
  assert.equal(r.pct, 20);
});

test("too little history gives no change", () => {
  assert.equal(lastDays([{ date: "2026-09-28T00:00:00.000Z", value: 5 }], 30, now).change, null);
});

test("a close from another asset sharing the symbol is ignored", () => {
  // A $0.005 token named like a $12 stock: the stock's closes must not value the token.
  const path = holdingsPath([{ symbol: "tok", qty: 1_000_000, value: 5_000 }], () => 12, 2, now);
  assert.deepEqual(
    path.map((p) => p.value),
    [5_000, 5_000, 5_000],
  );
});

test("holdings are valued at each day's close, today at today's price, and a missing close holds today's", () => {
  const closes: Record<string, number> = { "2026-09-26": 100, "2026-09-27": 110 };
  const closeOn = (_: string, d: Date) => closes[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`] ?? null;
  const path = holdingsPath([{ symbol: "btc", qty: 2, value: 240 }], closeOn, 3, now);
  assert.deepEqual(
    path.map((p) => p.value),
    [240, 200, 220, 240],
  );
});
