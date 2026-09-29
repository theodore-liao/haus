import assert from "node:assert/strict";
import test from "node:test";
import { combineBySymbol } from "./movers";

const move = (delta: number | null, pct: number | null) => ({ delta, pct });

test("the same symbol held in two places becomes one mover with summed moves", () => {
  const out = combineBySymbol([
    { id: "a", symbol: "btc", value: 110, day: move(10, 10), week: move(-5, -4.3), month: move(null, null) },
    { id: "b", symbol: "BTC", value: 220, day: move(20, 10), week: move(null, null), month: move(null, null) },
    { id: "c", symbol: "ETH", value: 50, day: move(1, 2), week: move(1, 2), month: move(1, 2) },
  ]);
  assert.equal(out.length, 2);
  const btc = out.find((m) => m.id === "a")!;
  assert.equal(btc.value, 330);
  assert.equal(btc.day.delta, 30);
  assert.equal(btc.day.pct, 10);
  assert.equal(btc.week.delta, -5);
  assert.equal(btc.month.delta, null);
});

test("movers without a symbol stay separate", () => {
  const blank = { value: 1, day: move(1, 1), week: move(1, 1), month: move(1, 1) };
  assert.equal(combineBySymbol([{ id: "x", symbol: null, ...blank }, { id: "y", symbol: null, ...blank }]).length, 2);
});
