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
  holderAge,
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
    expenses: [],
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

test("large expenses after retirement are added to the number, and ones before retirement are not", () => {
  const plain = retirementNumber(plan());
  const after = retirementNumber(plan({ expenses: [{ age: 70, amount: 500_000 }, { age: 66, amount: 40_000 }] }));
  const before = retirementNumber(plan({ expenses: [{ age: 50, amount: 200_000 }] }));
  const ra = realReturn(0.05, 0.03);
  close(after.expenses, 500_000 / (1 + ra) ** 5 + 40_000 / (1 + ra));
  close((after.number ?? 0) - (plain.number ?? 0), after.expenses);
  assert.equal(before.number, plain.number);
  assert.equal(before.expenses, 0);
});

test("a large expense before retiring comes out of savings that year, and the required saving still lands on the number", () => {
  const input = plan({ ageNow: 40, retireAge: 60, expenses: [{ age: 45, amount: 50_000 }, { age: 52, amount: 30_000 }] });
  const without = plan({ ageNow: 40, retireAge: 60 });
  const number = retirementNumber(input).number!;
  assert.equal(number, retirementNumber(without).number);
  const path = balancePath(input, 20_000);
  const plainPath = balancePath(without, 20_000);
  assert.equal(path.find((p) => p.age === 45)!.flow, 20_000 - 50_000);
  assert.ok(path.find((p) => p.age === 60)!.balance < plainPath.find((p) => p.age === 60)!.balance);
  assert.ok(requiredSaving(input, number) > requiredSaving(without, number));
  close(balancePath(input, requiredSaving(input, number)).find((p) => p.age === 60)!.balance, number, 1);
});

test("a large expense this year comes out with the first year's saving, and one from a past year is ignored", () => {
  const input = plan({ ageNow: 40, retireAge: 60, expenses: [{ age: 40, amount: 30_000 }, { age: 38, amount: 99_000 }] });
  const path = balancePath(input, 20_000);
  assert.equal(path.find((p) => p.age === 41)!.flow, 20_000 - 30_000);
  assert.deepEqual(path, balancePath(plan({ ageNow: 40, retireAge: 60, expenses: [{ age: 40, amount: 30_000 }] }), 20_000));
  assert.equal(retirementNumber(plan({ ageNow: 70, retireAge: 65, expenses: [{ age: 68, amount: 50_000 }] })).expenses, 0);
});

test("spending it down, a large expense after the money runs out is not planned for", () => {
  const down = { mode: "down" as const, liveTo: 90 };
  const inside = retirementNumber(plan({ ...down, expenses: [{ age: 80, amount: 100_000 }] }));
  const outside = retirementNumber(plan({ ...down, expenses: [{ age: 92, amount: 100_000 }] }));
  assert.ok(inside.expenses > 0);
  assert.equal(outside.expenses, 0);
  assert.equal(outside.number, retirementNumber(plan(down)).number);
  // Lasting for good, it still counts.
  assert.ok(retirementNumber(plan({ expenses: [{ age: 92, amount: 100_000 }] })).expenses > 0);
});

test("wage growth raises each year's saving in today's money, so less is needed to start", () => {
  // Pay rising 5% a year against 3% inflation grows saving about 1.94% a year in today's money.
  const flat = plan({ ageNow: 40, retireAge: 60 });
  const rising = plan({ ageNow: 40, retireAge: 60, wageGrowth: 0.05 });
  const path = balancePath(rising, 10_000);
  close(path[1].flow, 10_000, 0.01);
  close(path[2].flow, 10_000 * (1.05 / 1.03), 0.01);
  const number = retirementNumber(flat).number!;
  assert.ok(requiredSaving(rising, number) < requiredSaving(flat, number));
  close(balancePath(rising, requiredSaving(rising, number)).find((p) => p.age === 60)!.balance, number, 1);
  // Pay that only keeps up with inflation changes nothing.
  close(requiredSaving(plan({ ageNow: 40, retireAge: 60, wageGrowth: 0.03 }), number), requiredSaving(flat, number), 0.01);
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
  const input = plan({ ageNow: 40, retireAge: 60, expenses: [{ age: 50, amount: 300_000 }] });
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
  const input = plan({ ageNow: 31.6, retireAge: 49, liveTo: 100, children: [{ birthYear: 2028 }], expenses: [{ age: 37, amount: 400_000 }] });
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

test("a part-year age counts every year of a child's costs", () => {
  // Retire at once with nothing else to pay and no real return: the number is the sum of the child's costs.
  const input = (ageNow: number) =>
    plan({ ageNow, retireAge: Math.floor(ageNow) + 1, liveTo: 100, mode: "down", invested: 0, annualSpend: 0, growth: 0.03, returnAfter: 0.03, children: [{ birthYear: 2030 }] });
  close(retirementNumber(input(36)).kids, 18 * 25_000 + 4 * 70_000);
  close(retirementNumber(input(36.6)).kids, 18 * 25_000 + 4 * 70_000);
});

test("today's-money saving equals a dollar saving that rises with prices, grown at the nominal rate", () => {
  const input = plan({ ageNow: 40, retireAge: 60, invested: 100_000, growth: 0.07, inflation: 0.03 });
  const saving = 30_000;
  const real = balancePath(input, saving).find((p) => p.age === 60)!.balance;
  // The same plan in actual dollars: each year's saving is today's figure grown with prices.
  let nominal = 100_000;
  for (let year = 1; year <= 20; year++) nominal = nominal * 1.07 + saving * 1.03 ** year;
  close(nominal / 1.03 ** 20, real, 1);
});

test("a partner who stops first takes their pay out of each year's saving until the household retires", () => {
  const base = plan({ retireAge: 60 });
  const apart = { ...base, earlyStop: { age: 57, pay: 50_000 } };
  const rb = realReturn(base.growth, base.inflation);
  const together = balancePath(base, 80_000);
  const split = balancePath(apart, 80_000);
  // Same until the partner stops at 57.
  close(split.find((p) => p.age === 57)!.balance, together.find((p) => p.age === 57)!.balance);
  // Three years (57, 58, 59) save 50,000 less, each grown to 60.
  const lost = 50_000 * ((1 + rb) ** 2 + (1 + rb) + 1);
  close(split.find((p) => p.age === 60)!.balance, together.find((p) => p.age === 60)!.balance - lost);
  // Pay above saving draws on the balance rather than stopping at zero.
  const short = balancePath({ ...base, earlyStop: { age: 59, pay: 200_000 } }, 80_000);
  assert.ok(short.find((p) => p.age === 60)!.flow < 0);
});

test("retiring apart needs more saving, and no pay lost leaves the plan unchanged", () => {
  const base = plan({ retireAge: 60 });
  const number = retirementNumber(base).number!;
  const together = requiredSaving(base, number);
  const apart = requiredSaving({ ...base, earlyStop: { age: 55, pay: 40_000 } }, number);
  assert.ok(apart > together);
  close(requiredSaving({ ...base, earlyStop: { age: 55, pay: 0 } }, number), together);
  // The number is what's needed once both have retired, so the gap years do not change it.
  close(retirementNumber({ ...base, earlyStop: { age: 55, pay: 40_000 } }).number, number);
});

test("the earliest retire age keeps partners the same years apart", () => {
  const base = plan({ retireAge: 60, invested: 2_000_000, annualSpend: 60_000 });
  const apart = { ...base, earlyStop: { age: 57, pay: 30_000 } };
  const pace = earliestRetireAge(apart, 60_000, 94)!;
  assert.ok(pace != null && pace < 60);
  // At that age, with the partner 3 years earlier, the plan fits; a year sooner it does not.
  const fits = (age: number) => {
    const p = { ...apart, retireAge: age, earlyStop: { age: age - 3, pay: 30_000 } };
    return requiredSaving(p, retirementNumber(p).number!) <= 60_000.5;
  };
  assert.ok(fits(pace));
  if (pace > Math.floor(base.ageNow) + 1) assert.ok(!fits(pace - 1));
});

test("an age turns over on the birthday itself, whatever the leap years in between", () => {
  assert.equal(Math.floor(holderAge("1989-03-01", "2026-03-01")), 37);
  assert.equal(Math.floor(holderAge("1989-03-01", "2026-02-28")), 36);
  assert.equal(Math.floor(holderAge("2000-03-01", "2003-03-01")), 3);
  assert.equal(holderAge("1990-04-12", "2026-04-12"), 36);
  // Halfway through a year of age reads as about half.
  assert.ok(Math.abs(holderAge("1990-01-01", "2026-07-02") - 36.5) < 0.01);
  // A 29 February birthday turns over on 1 March in other years.
  assert.equal(Math.floor(holderAge("1996-02-29", "2026-02-28")), 29);
  assert.equal(Math.floor(holderAge("1996-02-29", "2026-03-01")), 30);
  assert.equal(Math.floor(holderAge("1996-02-29", "2028-02-29")), 32);
});
