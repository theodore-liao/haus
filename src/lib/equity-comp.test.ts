import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupeEspp, equityKind, priorQuarter, trailingYear, type EquityEvent } from "./equity-comp";
import { contributionsPriorQuarter, estimateSaving } from "./retirement-snapshot";
import { annualisedSpend } from "./queries";

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
  it("reads other brokers' stock-pay wording, whatever the employer", () => {
    assert.equal(equityKind({ type: "transfer", name: "Stock Plan Activity GOOG GSU", quantity: 12, amount: 2000 }), "vest");
    assert.equal(equityKind({ type: "transfer", name: "META Share Release", quantity: 8, amount: 5000 }), "vest");
    assert.equal(equityKind({ type: "transfer", name: "AMZN RSU RELEASE", quantity: 3, amount: 600 }), "vest");
    assert.equal(equityKind({ type: "buy", name: "Employee Stock Purchase Plan META", quantity: 10, amount: 4000 }), "espp");
    assert.equal(equityKind({ type: "transfer", name: "ESPP Deposit NVDA", quantity: 20, amount: 2500 }), "espp");
    assert.equal(equityKind({ type: "buy", name: "SPP PURCHASE AAPL", quantity: 9, amount: 1700 }), "espp");
  });
  it("leaves the cash credit that funds an ESPP buy, and ESPP shares leaving, alone", () => {
    assert.equal(equityKind({ type: "cash", name: "JOURNALED SPP PURCHASE CREDIT", quantity: 0, amount: -7843 }), null);
    assert.equal(equityKind({ type: "transfer", name: "ESPP shares transferred out", quantity: -20, amount: 2500 }), null);
  });
});

describe("dedupeEspp", () => {
  it("keeps one purchase when the plan and the brokerage both report it", () => {
    const plan: EquityEvent = { id: "p", date: "2026-06-30", kind: "espp", amount: 7843.69, security: "Acme" };
    const broker: EquityEvent = { id: "b", date: "2026-07-02", kind: "espp", amount: 7843.69, security: "Acme" };
    const later: EquityEvent = { id: "l", date: "2026-09-30", kind: "espp", amount: 7843.69, security: "Acme" };
    assert.deepEqual(dedupeEspp([broker, plan, later]).map((e) => e.id), ["p", "l"]);
  });
  it("never merges vests", () => {
    const a: EquityEvent = { id: "a", date: "2026-08-31", kind: "vest", amount: 1000, security: "Acme" };
    assert.equal(dedupeEspp([a, { ...a, id: "b" }]).length, 2);
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

describe("priorQuarter", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  it("keeps vests in the three complete months before this one and multiplies by 4", () => {
    const rows = [ev("2026-09-01", 10_000), ev("2026-07-03", 10_000), ev("2026-06-01", 12_000), ev("2026-10-01", 9_000)];
    const y = priorQuarter(rows, "vest", now);
    assert.deepEqual(y.items.map((e) => e.date), ["2026-09-01", "2026-07-03"]);
    assert.equal(y.total, 20_000);
    assert.equal(y.annual, 80_000);
  });
  it("keeps kinds apart", () => {
    assert.equal(priorQuarter([ev("2026-09-01", 500, "espp")], "vest", now).total, 0);
    assert.equal(priorQuarter([ev("2026-09-01", 500, "espp")], "espp", now).annual, 2_000);
  });
});

describe("estimateSaving with stock pay", () => {
  it("adds vests, ESPP, and the already annualised contributions", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    const base = estimateSaving({ payAnnual: 100_000, spendAnnual: 60_000, contributionsAnnual: 0, now })!;
    const withStock = estimateSaving({ payAnnual: 100_000, spendAnnual: 60_000, contributionsAnnual: 8_000, vestAnnual: 40_000, esppAnnual: 30_000, now })!;
    assert.equal(withStock.amount - base.amount, 78_000);
    assert.equal(withStock.contributions, 8_000);
  });
});

describe("contributions and spending in the three months before this one", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  it("sums retirement contributions in those months", () => {
    const total = contributionsPriorQuarter(
      [
        {
          contributions: [
            { date: "2026-09-15", amount: 1_000 },
            { date: "2026-06-01", amount: 5_000 },
            { date: "2026-10-01", amount: 700 },
          ],
        },
      ],
      now,
    );
    assert.equal(total, 1_000);
  });
  it("annualises only spending in those months, times 4", () => {
    const flow = (date: string, amount: number, category = "Food") => ({ date, month: date.slice(0, 7), kind: "spend" as const, category, merchant: "Shop", amount });
    const run = annualisedSpend([flow("2026-09-01", 100), flow("2026-06-01", 900), flow("2026-10-01", 50), flow("2026-08-01", 40, "Loan payments")], now)!;
    assert.equal(run.total, 140);
    assert.equal(run.noLoans, 100);
    assert.equal(run.factor, 4);
    assert.equal(run.basis, "3 months before this one");
  });
});
