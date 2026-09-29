import assert from "node:assert/strict";
import test from "node:test";
import { buildInsights, rankInsights, topActions, type InsightInput } from "./insights";

function base(over: Partial<InsightInput> = {}): InsightInput {
  return {
    cash: 30_000,
    monthlyEssential: 4_000,
    cashRate: 4,
    growthRate: 7,
    income3: 30_000,
    spend3: 21_000,
    housing3: 6_000,
    payAnnual: 120_000,
    spendAnnual: 84_000,
    cards: { used: 1_000, limit: 20_000, count: 2 },
    debts: [],
    fees90: 0,
    netWorth: 400_000,
    grossAssets: 700_000,
    liabilities: 300_000,
    netWorthThen: null,
    savedSince: null,
    invested: 100_000,
    crypto: 0,
    mix: null,
    retirement: null,
    contributions: null,
    college: null,
    realGrowth: 0.04,
    ...over,
  };
}

const find = (list: ReturnType<typeof buildInsights>, id: string) => list.find((i) => i.id === id);

test("emergency fund against a six-month reserve", () => {
  const ok = find(buildInsights(base({ cash: 30_000, monthlyEssential: 4_000 })), "reserve");
  assert.equal(ok?.status, "good");
  const short = find(buildInsights(base({ cash: 10_000, monthlyEssential: 4_000 })), "reserve");
  assert.equal(short?.status, "act");
  assert.match(short!.next, /Build \$14,000 more cash/);
});

test("idle cash shows only well past the reserve, priced against the planner's growth", () => {
  assert.equal(find(buildInsights(base({ cash: 25_000 })), "idle-cash"), undefined);
  const idle = find(buildInsights(base({ cash: 54_000, cashRate: 4, growthRate: 7 })), "idle-cash");
  assert.ok(idle);
  // 54,000 − 24,000 reserve = 30,000, at a 3-point gap.
  assert.equal(idle!.value, "$30,000.00");
  assert.match(idle!.next, /about \$900 more a year/);
});

test("savings rate against target", () => {
  const good = find(buildInsights(base({ income3: 30_000, spend3: 21_000 })), "savings-rate");
  assert.equal(good?.value, "30%");
  assert.equal(good?.status, "good");
  const low = find(buildInsights(base({ income3: 30_000, spend3: 28_500 })), "savings-rate");
  assert.equal(low?.status, "act");
});

test("the most expensive debt names a card before a mortgage", () => {
  const list = buildInsights(
    base({
      debts: [
        { name: "Mortgage", balance: 300_000, rate: 6.25, kind: "mortgage" },
        { name: "Card", balance: 4_000, rate: 22.9, kind: "card" },
      ],
    }),
  );
  const debt = find(list, "debt-rate");
  assert.equal(debt?.status, "act");
  assert.match(debt!.next, /Pay down Card first/);
  assert.equal(topActions(list)[0].id, "debt-rate");
});

test("a mortgage at an ordinary rate is not a problem", () => {
  const debt = find(buildInsights(base({ debts: [{ name: "Mortgage", balance: 300_000, rate: 6.25, kind: "mortgage" }] })), "debt-rate");
  assert.equal(debt?.status, "good");
});

test("retirement card follows the planner's verdict", () => {
  const behind = find(
    buildInsights(
      base({
        retirement: { number: 2_000_000, needed: 60_000, saving: 40_000, retireAge: 55, paceAge: 59, ageKnown: true, retireYear: 2045 },
      }),
    ),
    "retirement",
  );
  assert.equal(behind?.status, "act");
  assert.match(behind!.next, /Save \$20,000 more a year to retire at 55, or plan on 59/);
  const ahead = find(
    buildInsights(
      base({
        retirement: { number: 2_000_000, needed: 30_000, saving: 40_000, retireAge: 55, paceAge: 52, ageKnown: true, retireYear: 2045 },
      }),
    ),
    "retirement",
  );
  assert.equal(ahead?.status, "good");
  assert.match(ahead!.next, /retire at 52/);
});

test("ranking puts act before watch before on track", () => {
  const list = rankInsights(
    buildInsights(
      base({
        cash: 10_000,
        cards: { used: 9_000, limit: 20_000, count: 1 },
        fees90: 50,
      }),
    ),
  );
  const order = list.map((i) => i.status);
  const rank = { act: 0, watch: 1, good: 2, info: 3 } as const;
  for (let i = 1; i < order.length; i++) assert.ok(rank[order[i - 1]] <= rank[order[i]]);
});

test("contributions wait until some are recorded this year", () => {
  assert.equal(find(buildInsights(base({ contributions: { ytd: 0, room: 32_000, yearFraction: 0.75 } })), "contributions"), undefined);
  const c = find(buildInsights(base({ contributions: { ytd: 12_000, room: 32_000, yearFraction: 0.75 } })), "contributions");
  assert.match(c!.next, /\$16,000 of this year's tax-advantaged room goes unused/);
});

test("small fees stay out of the to-do list", () => {
  const small = find(buildInsights(base({ fees90: 12 })), "fees");
  assert.equal(small?.status, "info");
  assert.equal(small?.value, "$12.00 in 90 days");
  assert.equal(find(buildInsights(base({ fees90: 90 })), "fees")?.status, "watch");
});

test("college with little saved asks for a monthly amount that grows like the planner's money", () => {
  const college = { balances: 0, cost: 280_000, children: 1, firstYear: 2037, monthsToFirst: 131, planned: false };
  const c = find(buildInsights(base({ college, realGrowth: 0 })), "college");
  assert.equal(c?.status, "act");
  assert.match(c!.next, /Saving \$2,137 a month in a 529 covers it by 2037/);
  const grown = find(buildInsights(base({ college, realGrowth: 0.04 })), "college");
  const amount = Number(grown!.next.match(/\$([\d,]+)/)![1].replace(/,/g, ""));
  assert.ok(amount < 2_137 && amount > 1_500, `growth lowers the monthly amount, got ${amount}`);
});

test("college the retirement plan already pays for is not a second savings goal", () => {
  const college = { balances: 0, cost: 280_000, children: 1, firstYear: 2037, monthsToFirst: 131, planned: true };
  const c = find(buildInsights(base({ college })), "college");
  assert.equal(c?.status, "info");
  assert.match(c!.next, /already pays for college/);
});


test("every meter puts its target at the same place", () => {
  const list = buildInsights(base({}));
  const targets = new Set(list.filter((i) => i.meter).map((i) => i.meter!.target.toFixed(3)));
  assert.equal(targets.size, 1);
});

test("stock mix is information only", () => {
  const mix = find(buildInsights(base({ mix: { stocks: 60, bonds: 30, cash: 10 } })), "mix");
  assert.equal(mix?.status, "info");
  assert.equal(mix?.value, "60%");
});
