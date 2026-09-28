import assert from "node:assert/strict";
import test from "node:test";
import { startOfDay } from "./format";
import { closeDaysAgo, historyIsCurrent } from "./price-window";

function put(map: Map<string, number>, symbol: string, date: Date, close: number) {
  map.set(`${symbol}|${startOfDay(date).toISOString()}`, close);
}

test("a week uses the close about seven days back", () => {
  const map = new Map<string, number>();
  const now = new Date(2026, 8, 28, 15);
  put(map, "AAA", new Date(2026, 8, 21), 100);
  put(map, "AAA", new Date(2026, 8, 25), 110);
  assert.equal(closeDaysAgo(map, "AAA", now, 7), 100);
});

test("a week refuses a bar from well before that week", () => {
  const map = new Map<string, number>();
  const now = new Date(2026, 8, 28, 15);
  put(map, "BBB", new Date(2026, 8, 16), 50);
  assert.equal(closeDaysAgo(map, "BBB", now, 7), null);
});

test("the Monday after a Monday holiday still finds Friday's close", () => {
  const map = new Map<string, number>();
  // Labor Day 2026 is Monday Sep 7. A week later, that Monday has no close.
  const now = new Date(2026, 8, 14, 15);
  put(map, "CCC", new Date(2026, 8, 4), 40);
  assert.equal(closeDaysAgo(map, "CCC", now, 7), 40);
});

test("a week walks back over a weekend to Friday", () => {
  const map = new Map<string, number>();
  const sunday = new Date(2026, 8, 27, 12);
  put(map, "CCC", new Date(2026, 8, 18), 80);
  assert.equal(closeDaysAgo(map, "CCC", sunday, 7), 80);
});

test("history counts as current through a long weekend and stale after that", () => {
  assert.equal(historyIsCurrent(new Date(2026, 8, 25), new Date(2026, 8, 28), 6), true);
  assert.equal(historyIsCurrent(new Date(2026, 8, 18), new Date(2026, 8, 28), 6), false);
});
