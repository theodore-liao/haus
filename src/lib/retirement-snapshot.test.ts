import assert from "node:assert/strict";
import test from "node:test";
import { keepRetireYear, retireTiming, retirementSnapshot } from "./retirement-snapshot";

const TODAY = "2026-10-16";
// A is 40 this year, B is 45.
const BOTH = [
  { key: "A" as const, birthdate: "1986-01-15" },
  { key: "B" as const, birthdate: "1981-01-15" },
];

test("without their own ages, both partners retire the year the household retire age gives", () => {
  const t = retireTiming({ prefs: { retireAge: 60, holderKey: "A" }, holders: BOTH, today: TODAY });
  assert.equal(t.retireAge, 60);
  assert.equal(t.retireYear, 2046);
  assert.deepEqual(t.partners!.map((p) => [p.key, p.retireAge, p.retireYear]), [
    ["A", 60, 2046],
    ["B", 65, 2046],
  ]);
  assert.equal(t.early, null);
});

test("an older partner past the slider's end keeps the same year until someone moves a slider", () => {
  const t = retireTiming({ prefs: { retireAge: 63, holderKey: "A" }, holders: BOTH, today: TODAY });
  assert.deepEqual(t.partners!.map((p) => p.retireYear), [2049, 2049]);
  assert.equal(t.partners![1].retireAge, 68);
  assert.equal(t.early, null);
});

test("partners retiring apart: the household retires with the later one, and the earlier one's pay stops", () => {
  const t = retireTiming({
    prefs: { holderKey: "A", retireAgeA: 55, retireAgeB: 65, stopPayA: 90_000 },
    holders: BOTH,
    today: TODAY,
    payAnnual: 200_000,
  });
  // A at 55 is 2041; B at 65 is 2046. On A's timeline, the household retires at 60.
  assert.equal(t.retireYear, 2046);
  assert.equal(t.retireAge, 60);
  assert.deepEqual(t.early, { key: "A", age: 55, year: 2041, pay: 90_000, payOwn: true });
});

test("without a partner's own pay, half the household's take-home pay stands in", () => {
  const t = retireTiming({ prefs: { holderKey: "B", retireAgeA: 60, retireAgeB: 55 }, holders: BOTH, today: TODAY, payAnnual: 150_000 });
  // B at 55 is 2036; A at 60 is 2046. On B's timeline, the household retires at 65.
  assert.equal(t.retireAge, 65);
  assert.deepEqual(t.early, { key: "B", age: 55, year: 2036, pay: 75_000, payOwn: false });
});

test("one birthdate, or none, keeps the single retire age", () => {
  const one = retireTiming({ prefs: { retireAge: 58, retireAgeB: 50 }, holders: [BOTH[0], { key: "B", birthdate: null }], today: TODAY });
  assert.equal(one.partners, null);
  assert.equal(one.retireAge, 58);
  const none = retireTiming({ prefs: { yearsFallback: 10 }, holders: [{ key: "A", birthdate: null }], today: TODAY });
  assert.equal(none.ageNow, null);
  assert.equal(none.retireYear, 2036);
});

test("the verdict needs more saving when one partner stops earlier", () => {
  const common = {
    holders: BOTH,
    today: TODAY,
    investedDefault: 500_000,
    spendNow: 80_000,
    saveNow: 60_000,
    childBalances: 0,
    householdChildren: [],
    payAnnual: 200_000,
  };
  const together = retirementSnapshot({ ...common, prefs: { holderKey: "A", retireAgeA: 60, retireAgeB: 65, annualSpend: 80_000 } });
  const apart = retirementSnapshot({ ...common, prefs: { holderKey: "A", retireAgeA: 55, retireAgeB: 65, annualSpend: 80_000 } });
  assert.equal(together.retireYear, apart.retireYear);
  assert.ok(apart.needed! > together.needed!);
  assert.deepEqual(apart.partners, [
    { key: "A", retireAge: 55, retireYear: 2041 },
    { key: "B", retireAge: 65, retireYear: 2046 },
  ]);
});

test("moving one partner keeps an older partner pinned past 65 where they were", () => {
  // Same year at 63 for A puts B at 68. Moving A pins both ages; B must stay 68, not drop to 65.
  const t = retireTiming({ prefs: { holderKey: "A", retireAge: 63, retireAgeA: 58, retireAgeB: 68 }, holders: BOTH, today: TODAY });
  const b = t.partners!.find((p) => p.key === "B")!;
  assert.equal(b.retireAge, 68);
  assert.equal(b.retireYear, 2049);
  assert.equal(b.max, 68);
});

test("typing in the second birthdate keeps the household's retire year, and clears per-partner ages left from before", () => {
  const today = "2026-10-20";
  const before = [
    { key: "A" as const, birthdate: "1990-04-12" },
    { key: "B" as const, birthdate: null },
  ];
  const after = [before[0], { key: "B" as const, birthdate: "1991-09-03" }];
  // Alex retires at 60 in 2050; 60 and 55 are left over from a time both birthdates were set.
  const prefs = { holderKey: "B" as const, retireAge: 60, retireAgeA: 60, retireAgeB: 55 };
  const kept = keepRetireYear({ prefs, before, after, today })!;
  assert.deepEqual(kept, { retireAgeA: null, retireAgeB: null, holderKey: "A", retireAge: 60 });
  const now = retireTiming({ prefs: { ...prefs, ...kept }, holders: after, today });
  assert.equal(now.retireYear, 2050);
  assert.equal(now.early, null);
  assert.deepEqual(now.partners?.map((p) => p.retireYear), [2050, 2050]);
});

test("the first birthdate keeps the year the years slider chose, and clearing it goes back to years", () => {
  const today = "2026-10-20";
  const none = [{ key: "A" as const, birthdate: null }];
  const one = [{ key: "A" as const, birthdate: "1980-05-05" }];
  const kept = keepRetireYear({ prefs: { yearsFallback: 10 }, before: none, after: one, today })!;
  assert.equal(kept.retireAge, 56);
  assert.equal(retireTiming({ prefs: { yearsFallback: 10, ...kept }, holders: one, today }).retireYear, 2036);
  const back = keepRetireYear({ prefs: { retireAge: 56 }, before: one, after: none, today })!;
  assert.equal(back.yearsFallback, 10);
  assert.equal(retireTiming({ prefs: back, holders: none, today }).retireYear, 2036);
});

test("a first birthdate keeps a 25-year plan when that age is past 65", () => {
  const today = "2026-10-21";
  const none = [{ key: "A" as const, birthdate: null }];
  // 50 this year. Retire in 25 years is 2051, which is age 75, past the slider's usual end.
  const one = [{ key: "A" as const, birthdate: "1976-01-01" }];
  const before = retireTiming({ prefs: { yearsFallback: 25 }, holders: none, today });
  assert.equal(before.retireYear, 2051);
  const kept = keepRetireYear({ prefs: { yearsFallback: 25 }, before: none, after: one, today })!;
  assert.equal(kept.retireAge, 75);
  const after = retireTiming({ prefs: { yearsFallback: 25, ...kept }, holders: one, today });
  assert.equal(after.retireYear, 2051);
  assert.equal(after.retireAge, 75);
  assert.equal(after.maxRetire, 75);
});

test("a retire age of 60 still ends the slider at 65", () => {
  const t = retireTiming({ prefs: { retireAge: 60 }, holders: [BOTH[0]], today: TODAY });
  assert.equal(t.maxRetire, 65);
  assert.equal(t.retireAge, 60);
});

test("clearing the last birthdate keeps a retirement more than 25 years away", () => {
  const today = "2026-10-21";
  // 30 this year, retiring at 65, which is 2061: 35 years out, past the no-birthdate slider's usual end.
  const one = [{ key: "A" as const, birthdate: "1996-01-01" }];
  const none = [{ key: "A" as const, birthdate: null }];
  const prefs = { retireAge: 65 };
  assert.equal(retireTiming({ prefs, holders: one, today }).retireYear, 2061);
  const kept = keepRetireYear({ prefs, before: one, after: none, today })!;
  assert.equal(kept.yearsFallback, 35);
  assert.equal(retireTiming({ prefs: { ...prefs, ...kept }, holders: none, today }).retireYear, 2061);
});

test("the second birthdate keeps a year that puts the first partner past 65", () => {
  const today = "2026-10-21";
  const before = [
    { key: "A" as const, birthdate: "1976-01-01" },
    { key: "B" as const, birthdate: null },
  ];
  const after = [before[0], { key: "B" as const, birthdate: "1980-06-01" }];
  // 75 and 55 are left over from an earlier time both birthdates were set; the plan on screen is age 75, year 2051.
  const prefs = { retireAge: 75, retireAgeA: 60, retireAgeB: 55 };
  const kept = keepRetireYear({ prefs, before, after, today })!;
  const now = retireTiming({ prefs: { ...prefs, ...kept }, holders: after, today });
  assert.equal(now.retireYear, 2051);
  assert.deepEqual(now.partners?.map((p) => p.retireYear), [2051, 2051]);
  assert.equal(now.early, null);
});

test("clearing one partner's birthdate keeps the year the household finishes working", () => {
  const today = "2026-10-20";
  const both = [
    { key: "A" as const, birthdate: "1990-04-12" },
    { key: "B" as const, birthdate: "1991-09-03" },
  ];
  const onlyA = [both[0], { key: "B" as const, birthdate: null }];
  // Sam retires in 2046 and Alex in 2050: the household is retired in 2050.
  const prefs = { retireAge: 60, retireAgeA: 60, retireAgeB: 55 };
  const kept = keepRetireYear({ prefs, before: both, after: onlyA, today })!;
  assert.equal(retireTiming({ prefs: { ...prefs, ...kept }, holders: onlyA, today }).retireYear, 2050);
});

test("correcting a birthdate keeps the ages chosen, so nothing is rewritten", () => {
  const today = "2026-10-20";
  const before = [{ key: "A" as const, birthdate: "1990-04-12" }];
  const after = [{ key: "A" as const, birthdate: "1989-04-12" }];
  assert.equal(keepRetireYear({ prefs: { retireAge: 60 }, before, after, today }), null);
});
