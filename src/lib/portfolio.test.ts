import assert from "node:assert/strict";
import test from "node:test";
import { dividendSummary, portfolioSummary } from "./portfolio";

const row = (symbol: string | null, value: number, costBasis: number | null, dayPl: number | null) => ({
  symbol,
  name: symbol ?? "Fund",
  value,
  costBasis,
  dayPl,
});

test("summary adds value and day moves; gain covers only holdings with a cost", () => {
  const s = portfolioSummary([row("AAA", 1000, 800, 10), row("BBB", 500, null, -5), row(null, 200, 100, null)]);
  assert.equal(s.value, 1700);
  assert.equal(s.day, 5);
  assert.ok(Math.abs(s.dayPct! - (5 / 1695) * 100) < 1e-9);
  assert.equal(s.cost, 900);
  assert.equal(s.gain, 300);
  assert.ok(Math.abs(s.gainPct! - 33.3333333) < 1e-6);
  assert.equal(s.costed, 2);
});

test("no cost and no day moves leave those figures empty", () => {
  const s = portfolioSummary([row("AAA", 100, null, null)]);
  assert.equal(s.day, null);
  assert.equal(s.cost, null);
  assert.equal(s.gain, null);
});

test("dividends this year and over 12 months, with yield on today's value", () => {
  const now = new Date("2026-09-15T12:00:00");
  const d = dividendSummary(
    [
      { date: "2026-03-01T00:00:00Z", type: "cash", subtype: "dividend", name: "AAA DIVIDEND", amount: -40 },
      { date: "2025-12-01T00:00:00Z", type: "cash", subtype: "qualified dividend", name: "BBB", amount: -60 },
      { date: "2025-06-01T00:00:00Z", type: "cash", subtype: "dividend", name: "old", amount: -99 },
      { date: "2026-04-01T00:00:00Z", type: "buy", subtype: "dividend reinvestment", name: "AAA", amount: 40 },
      { date: "2026-05-01T00:00:00Z", type: "buy", subtype: "buy", name: "CCC", amount: 500 },
    ],
    10000,
    now,
  );
  assert.equal(d.ytd, 40);
  assert.equal(d.trailing, 100);
  assert.equal(d.count, 2);
  assert.equal(d.yieldPct, 1);
});
