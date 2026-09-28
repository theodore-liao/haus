import assert from "node:assert/strict";
import test from "node:test";
import {
  milestone,
  balancePath,
  requiredSaving,
  earliestRetireAge,
  ageAtAmount,
  kidCostIn,
  affordableSpend,
  bridgeCost,
  moneyBecomes,
  realReturn,
  retirementNumber,
  type MilestoneInput,
  type RetirementPlanInput,
} from "./retirement-plan";

function close(actual: number | null, expected: number, tol = 1) {
  assert.ok(actual != null, `expected ${expected}, got null`);
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} vs ${expected}`);
}

function plan(over: Partial<RetirementPlanInput> = {}): RetirementPlanInput {
  return {
    ageNow: 40,
    currentYear: 2026,
    growth: 0.07,
    inflation: 0.03,
    returnAfter: 0.05,
    retireAge: 65,
    liveTo: 95,
    mode: "forever",
    invested: 100_000,
    annualSpend: 100_000,
    childAnnual: 25_000,
    collegeAnnual: 70_000,
    children: [],
    childBalances: 0,
    housePrice: null,
    houseAge: null,
    otherIncome: 0,
    otherIncomeAge: 67,
    tax: 0,
    ...over,
  };
}

function goal(over: Partial<MilestoneInput> = {}): MilestoneInput {
  return {
    invested: 0,
    contribution: 0,
    rate: 0,
    growth: 0,
    inflation: 0,
    target: 1_000,
    targetAge: 50,
    ageNow: 40,
    housePrice: null,
    houseAge: null,
    retireAge: 65,
    todayMoney: true,
    ...over,
  };
}

test("what money becomes: future, today's money, and cash", () => {
  const got = moneyBecomes(10_000, 20, 0.03, 0.07);
  close(got.then, 10_000 * 1.07 ** 20, 0.01);
  close(got.today, 10_000 * (1.07 / 1.03) ** 20, 0.01);
  close(got.cash, 10_000 / 1.03 ** 20, 0.01);
});

test("forever costs more than spending the balance down", () => {
  const forever = retirementNumber(plan({ mode: "forever" }));
  const down = retirementNumber(plan({ mode: "down" }));
  const ra = realReturn(0.05, 0.03);
  // Each year's spending comes out at the start of the year: a perpetuity due.
  close(forever.number, (100_000 * (1 + ra)) / ra);
  assert.ok(forever.number != null && down.number != null && forever.number > down.number);
});

test("forever is not possible when the return does not beat inflation", () => {
  const got = retirementNumber(plan({ returnAfter: 0.02, inflation: 0.03, mode: "forever" }));
  assert.equal(got.impossible, true);
  assert.equal(got.number, null);
  const down = retirementNumber(plan({ returnAfter: 0.02, inflation: 0.03, mode: "down" }));
  assert.equal(down.impossible, false);
  assert.ok(down.number != null && down.number > 0);
});

test("a child still at home at retirement is included", () => {
  const birthYear = 2026 + (65 - 40) - 10;
  const withChild = retirementNumber(plan({ children: [{ birthYear }] }));
  const paycheckOnly = retirementNumber(plan({ children: [{ birthYear }], childAnnual: 0 }));
  assert.ok(withChild.kids > 0);
  assert.ok(withChild.number != null && paycheckOnly.number != null && withChild.number > paycheckOnly.number);
});

test("child-account balances offset college", () => {
  const birthYear = 2026 + (65 - 40) - 18;
  const full = retirementNumber(plan({ children: [{ birthYear }], childBalances: 0 }));
  const half = retirementNumber(plan({ children: [{ birthYear }], childBalances: 140_000 }));
  assert.ok(full.kids > 0);
  close(half.kids, full.kids / 2);
});

test("a house after retirement is added, and one before retirement is not", () => {
  const plain = retirementNumber(plan());
  const after = retirementNumber(plan({ housePrice: 500_000, houseAge: 70 }));
  const before = retirementNumber(plan({ housePrice: 200_000, houseAge: 50 }));
  const ra = realReturn(0.05, 0.03);
  close(after.house, 500_000 / (1 + ra) ** 5);
  close((after.number ?? 0) - (plain.number ?? 0), after.house);
  assert.equal(before.number, plain.number);
  assert.equal(before.house, 0);
});

test("a house bought before retirement raises the saving a milestone needs", () => {
  const plain = milestone(goal());
  const withHouse = milestone(goal({ housePrice: 200, houseAge: 45 }));
  close(plain.yearly, 100, 0.01);
  close(withHouse.yearly, 120, 0.01);
});

test("other income lowers the number", () => {
  const got = retirementNumber(plan({ otherIncome: 20_000, otherIncomeAge: 67 }));
  const ra = realReturn(0.05, 0.03);
  const expected = 100_000 + 100_000 / (1 + ra) + (80_000 * (1 + ra)) / ra / (1 + ra) ** 2;
  close(got.number, expected);
});

test("tax on withdrawals grosses the need up", () => {
  const plain = retirementNumber(plan());
  const taxed = retirementNumber(plan({ tax: 0.15 }));
  close(taxed.number, (plain.number ?? 0) / 0.85);
});

test("already retired reports how long the money lasts", () => {
  const got = retirementNumber(
    plan({
      ageNow: 70,
      retireAge: 65,
      inflation: 0,
      returnAfter: 0,
      growth: 0,
      invested: 250_000,
      annualSpend: 100_000,
      mode: "down",
    }),
  );
  assert.equal(got.alreadyRetired, true);
  assert.equal(got.lastsUntilAge, 72);
});

test("retire age at or after the last age is an error", () => {
  assert.equal(retirementNumber(plan({ retireAge: 95, liveTo: 95 })).error, "retire-after-live");
  assert.equal(retirementNumber(plan({ retireAge: 96, liveTo: 95 })).error, "retire-after-live");
});

test("zero invested is none of the way there, and negative invested is behind", () => {
  const zero = retirementNumber(plan({ invested: 0 }));
  const negative = retirementNumber(plan({ invested: -10_000 }));
  const funded = retirementNumber(plan({ invested: 100_000 }));
  assert.equal(zero.percent, 0);
  assert.equal(negative.number, funded.number);
  assert.ok(negative.percent != null && negative.percent < 0);
});

test("a short retirement warns with a withdrawal rate above 4%", () => {
  const got = retirementNumber(
    plan({ mode: "down", liveTo: 70, inflation: 0, returnAfter: 0, annualSpend: 100_000 }),
  );
  assert.ok(got.withdrawalRate != null && got.withdrawalRate > 0.04);
});

test("a milestone already reached, never reached, or aimed at a past age", () => {
  assert.equal(milestone(goal({ invested: 5_000, target: 1_000 })).status, "reached");
  const never = milestone(goal({ invested: 100, contribution: 0, rate: 0, target: 1_000, targetAge: 60 }));
  assert.equal(never.status, "ok");
  assert.equal(never.ageReached, null);
  assert.equal(milestone(goal({ invested: 10, target: 100, targetAge: 30, ageNow: 40 })).status, "past");
});

test("in future dollars a milestone is reached when the balance passes the goal for that year", () => {
  const got = milestone(goal({ invested: 0, contribution: 1_000, growth: 0, inflation: 0.1, target: 1_000, targetAge: 50, todayMoney: false }));
  // Year 1: 1,000 against a 1,100 goal. Year 2: 2,000 against 1,210.
  assert.equal(got.ageReached, 42);
});

test("a past target age is past even when the amount is already reached", () => {
  assert.equal(milestone(goal({ invested: 5_000, target: 1_000, targetAge: 30, ageNow: 40 })).status, "past");
});

test("saving the required amount lands on the retirement number at the retire age", () => {
  const input = plan({ ageNow: 40, retireAge: 60, housePrice: 300_000, houseAge: 50 });
  const number = retirementNumber(input).number!;
  const saving = requiredSaving(input, number);
  const path = balancePath(input, saving);
  close(path.find((p) => p.age === 60)!.balance, number, 1);
});

test("the path keeps the balance for good, or spends it to zero by the last age", () => {
  const forever = plan({ ageNow: 40, retireAge: 60 });
  const fPath = balancePath(forever, requiredSaving(forever, retirementNumber(forever).number!));
  const atRetire = fPath.find((p) => p.age === 60)!.balance;
  // Money that lasts for good stays flat in today's money once the costs settle.
  close(fPath[fPath.length - 1].balance, atRetire, 1);
  const down = plan({ ageNow: 40, retireAge: 60, mode: "down" });
  const dPath = balancePath(down, requiredSaving(down, retirementNumber(down).number!));
  close(dPath[dPath.length - 1].balance, 0, 1);
});

test("required saving is zero once invested money gets there on its own", () => {
  const input = plan({ invested: 50_000_000 });
  assert.equal(requiredSaving(input, retirementNumber(input).number!), 0);
});

test("earliest retire age at a saving rate, and the age a path reaches an amount", () => {
  const input = plan({ ageNow: 40, invested: 500_000 });
  const age = earliestRetireAge(input, 60_000);
  assert.ok(age != null && age > 40 && age < 80);
  const later = earliestRetireAge(input, 20_000);
  assert.ok(later == null || later > age!);
  const path = balancePath(input, 60_000);
  assert.equal(ageAtAmount(path, 100), 40);
  assert.equal(ageAtAmount(path, 1e15), null);
});

test("with a part-year age, saving the required amount still lands on the number", () => {
  const input = plan({ ageNow: 31.6, retireAge: 49, liveTo: 100, children: [{ birthYear: 2028 }], housePrice: 400_000, houseAge: 37 });
  const number = retirementNumber(input).number!;
  const path = balancePath(input, requiredSaving(input, number));
  close(path.find((p) => p.age === 49)!.balance, number, 1);
});

test("a child born before retiring lowers what can be saved in those years, and the required saving still lands on the number", () => {
  const input = plan({ ageNow: 40, retireAge: 60, children: [{ birthYear: 2030 }] });
  const without = plan({ ageNow: 40, retireAge: 60 });
  const number = retirementNumber(input).number!;
  const saving = requiredSaving(input, number);
  assert.ok(saving > requiredSaving(without, retirementNumber(without).number!));
  close(balancePath(input, saving).find((p) => p.age === 60)!.balance, number, 1);
  // A child already at home is in today's spending; the path only feels the change when college starts or the child leaves.
  assert.ok(kidCostIn(2031, input) > kidCostIn(2026, input));
});

test("health cover until Medicare adds to the number and shows as its own part", () => {
  const base = retirementNumber(plan({ retireAge: 55 }));
  const covered = retirementNumber(plan({ retireAge: 55, healthcareAnnual: 20_000 }));
  assert.ok(covered.number! > base.number!);
  assert.ok(covered.health > 0);
  assert.equal(retirementNumber(plan({ retireAge: 66, healthcareAnnual: 20_000 })).health, 0);
});

test("affordable spending is the spending the saving exactly supports", () => {
  const input = plan({ ageNow: 40, retireAge: 60 });
  const saving = requiredSaving(input, retirementNumber(input).number!);
  close(affordableSpend(input, saving), input.annualSpend, 5);
  assert.ok(affordableSpend(input, saving * 2)! > input.annualSpend);
});

test("the years before retirement accounts open cost something only when retiring before 60", () => {
  assert.equal(bridgeCost(plan({ retireAge: 60 })), 0);
  const early = bridgeCost(plan({ retireAge: 50 }));
  assert.ok(early > 9 * 100_000 && early < 10 * 100_000);
});
