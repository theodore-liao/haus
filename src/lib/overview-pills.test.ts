import assert from "node:assert/strict";
import test from "node:test";
import { overviewPillFigures } from "./overview-pills";

function netWorth(parts: {
  investments: number;
  cash: number;
  realEstate: number;
  otherAssets: number;
  liabilities: number;
}) {
  return parts.cash + parts.investments + parts.realEstate + parts.otherAssets - parts.liabilities;
}

function sum(parts: Parameters<typeof overviewPillFigures>[0]) {
  const pills = overviewPillFigures(parts);
  return pills.investments + pills.cash + pills.property + pills.liabilities;
}

test("a vehicle is property, so the overview pills add up to net worth", () => {
  // Seed 272682743: one vehicle is estimated at 250000 and the home at 1.
  const parts = { investments: 0, cash: 40912.36, realEstate: 1, otherAssets: 250000, liabilities: 4662.33 };
  const pills = overviewPillFigures(parts);
  assert.equal(pills.property, 250001);
  assert.equal(sum(parts), netWorth(parts));
});

test("investments outside stocks, crypto, and retirement still sit in investments", () => {
  const parts = { investments: 8000, cash: 10, realEstate: 0, otherAssets: 0, liabilities: 0 };
  assert.equal(overviewPillFigures(parts).investments, 8000);
  assert.equal(sum(parts), netWorth(parts));
});
