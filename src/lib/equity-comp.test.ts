import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { equityKind, trailingYear, type EquityEvent } from "./equity-comp";
import { estimateSaving } from "./retirement-snapshot";

describe("equityKind", () => {
  it("reads a broker's vest deposit as an RSU vest", () => {
    assert.equal(equityKind({ type: "transfer", name: "ACME CORP - CONVERSION SHARES DEPOSITED", quantity: 6.1, amount: 3100 }), "vest");
    assert.equal(equityKind({ type: "transfer", name: "RSU Vest ACME", quantity: 10, amount: 1000 }), "vest");
  });
  it("reads an ESPP buy as ESPP", () => {
    assert.equal(equityKind({ type: "buy", name: "ACME CORP - YOU BOUGHT ESPP### AS OF 06-30-26", quantity: 23, amount: 7800 }), "espp");
  });
  it("ignores ordinary buys, sells, dividends, reinvestment, and share transfers out", () => {
    assert.equal(equityKind({ type: "buy", name: "YOU BOUGHT ACME CORP", quantity: 5, amount: 1000 }), null);
    assert.equal(equityKind({ type: "sell", name: "YOU SOLD ACME CORP", quantity: -5, amount: -1000 }), null);
    assert.equal(equityKind({ type: "cash", name: "ACME DIVIDEND RECEIVED", quantity: 0, amount: -1200 }), null);
    assert.equal(equityKind({ type: "buy", name: "FUND - REINVESTMENT", quantity: 3, amount: 3 }), null);
    assert.equal(equityKind({ type: "transfer", name: "CONVERSION SHARES WITHDRAWN", quantity: -5, amount: 500 }), null);
  });
});

const ev = (date: string, amount: number, kind: "vest" | "espp" = "vest"): EquityEvent => ({ id: date + kind, date, kind, amount, security: "Acme" });

describe("trailingYear", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  it("sums the last 365 days and averages by month", () => {
    const rows = [ev("2026-08-31", 12_000), ev("2026-06-01", 12_000), ev("2026-03-02", 12_000), ev("2025-12-01", 12_000), ev("2025-08-01", 99_000)];
    const y = trailingYear(rows, "vest", now, "2025-01-01");
    assert.equal(y.total, 48_000);
    assert.equal(y.count, 4);
    assert.equal(y.months, 12);
    assert.equal(y.monthly, 4_000);
  });
  it("scales up when the linked history is shorter than a year", () => {
    const y = trailingYear([ev("2026-08-31", 6_000)], "vest", now, "2026-03-28");
    assert.equal(y.months, 6);
    assert.equal(y.annual, 12_000);
  });
  it("keeps kinds apart", () => {
    assert.equal(trailingYear([ev("2026-08-01", 500, "espp")], "vest", now, null).total, 0);
  });
});

describe("estimateSaving with stock pay", () => {
  it("adds vests and ESPP to what is saved", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    const base = estimateSaving({ payAnnual: 100_000, spendAnnual: 60_000, contributionsYtd: 0, now })!;
    const withStock = estimateSaving({ payAnnual: 100_000, spendAnnual: 60_000, contributionsYtd: 0, vestAnnual: 40_000, esppAnnual: 30_000, now })!;
    assert.equal(withStock.amount - base.amount, 70_000);
  });
});
