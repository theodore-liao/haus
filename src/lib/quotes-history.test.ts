import assert from "node:assert/strict";
import test from "node:test";
import { candleWindows, geckoHistoryDays, GECKO_HISTORY_DAYS, seriesStartsBy } from "./quotes";

test("a year is as far as the public coin history feed will go", () => {
  const to = new Date("2026-09-29T00:00:00Z");
  const year = new Date("2025-09-29T00:00:00Z");
  const twoYears = new Date("2024-09-29T00:00:00Z");
  assert.equal(geckoHistoryDays(year, to), GECKO_HISTORY_DAYS);
  assert.equal(geckoHistoryDays(twoYears, to), GECKO_HISTORY_DAYS);
  assert.ok(geckoHistoryDays(new Date("2026-08-15T00:00:00Z"), to) < 60);
});

test("a long exchange request is split into stretches the feed accepts", () => {
  const from = new Date("2024-01-01T00:00:00Z");
  const to = new Date("2026-01-01T00:00:00Z");
  const windows = candleWindows(from, to, 280);
  assert.ok(windows.length >= 3);
  assert.equal(windows[0].start.toISOString(), from.toISOString());
  assert.equal(windows[windows.length - 1].end.toISOString(), to.toISOString());
  for (const w of windows) {
    const days = (w.end.getTime() - w.start.getTime()) / 86_400_000;
    assert.ok(days <= 280);
    assert.ok(days > 0);
  }
  assert.equal(candleWindows(to, from, 280).length, 0);
});

test("a year of bars does not count as covering five years", () => {
  const from = new Date("2021-09-29T00:00:00Z");
  const rows = [{ date: new Date("2025-09-29T00:00:00Z") }, { date: new Date("2026-09-29T00:00:00Z") }];
  assert.equal(seriesStartsBy(rows, from), false);
  assert.equal(seriesStartsBy(rows, new Date("2025-09-25T00:00:00Z")), true);
});
