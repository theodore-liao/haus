import { test } from "node:test";
import assert from "node:assert/strict";
import { niceTicks, yearTicks } from "./chart-ticks";

test("value ticks are round steps from zero that reach the top", () => {
  assert.deepEqual(niceTicks(260_000), [0, 100_000, 200_000, 300_000]);
  assert.deepEqual(niceTicks(4_000_000), [0, 1_000_000, 2_000_000, 3_000_000, 4_000_000]);
  assert.deepEqual(niceTicks(0), [0]);
});

test("year ticks sit on multiples of their step", () => {
  assert.deepEqual(yearTicks(2026.8, 2056.5), [2030, 2035, 2040, 2045, 2050, 2055]);
  assert.deepEqual(yearTicks(2026, 2030), [2026, 2027, 2028, 2029, 2030]);
  assert.deepEqual(yearTicks(2001.3, 2056), [2010, 2020, 2030, 2040, 2050]);
});
