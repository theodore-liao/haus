/** Today's-money retirement math. Rates are decimals: 0.07 means 7%. */

export const IMPOSSIBLE_MESSAGE = "Not possible unless your return beats inflation";

export function realReturn(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1;
}

export function holderAge(birthdate: string, today: string): number {
  const born = new Date(`${birthdate}T00:00:00Z`);
  const at = new Date(`${today}T00:00:00Z`);
  return (at.getTime() - born.getTime()) / (365.25 * 86400000);
}

export function moneyBecomes(amount: number, years: number, inflation: number, growth: number) {
  const y = Number.isFinite(years) ? years : 0;
  const grown = 1 + growth;
  const prices = 1 + inflation;
  return {
    then: amount * grown ** y,
    today: amount * (grown / prices) ** y,
    cash: amount / prices ** y,
  };
}

export type PlanChild = { birthYear: number | null };

export type RetirementPlanInput = {
  ageNow: number;
  currentYear: number;
  growth: number;
  inflation: number;
  /** Nominal return after retiring. */
  returnAfter: number;
  retireAge: number;
  liveTo: number;
  mode: "forever" | "down";
  invested: number;
  annualSpend: number;
  childAnnual: number;
  collegeAnnual: number;
  children: PlanChild[];
  /** Child-account balances, subtracted from total college cost. */
  childBalances: number;
  housePrice: number | null;
  houseAge: number | null;
  otherIncome: number;
  otherIncomeAge: number;
  /** Tax rate on withdrawals, as a decimal. */
  tax: number;
  /** Yearly health cover from retiring until 65, when Medicare starts. Optional; zero when left out. */
  healthcareAnnual?: number;
};

/** Age Medicare starts: health cover before it is paid from savings. */
export const MEDICARE_AGE = 65;
/** Age retirement accounts can be drawn without the early-withdrawal penalty (59½, counted as 60 in whole years). */
export const PENALTY_FREE_AGE = 60;

export type RetirementPlanResult = {
  error: "retire-after-live" | null;
  impossible: boolean;
  /** Portfolio needed at retirement, in today's money. Null when it cannot be priced. */
  number: number | null;
  living: number;
  kids: number;
  /** Health cover from retiring until Medicare. */
  health: number;
  house: number;
  percent: number | null;
  firstYearNeed: number | null;
  /** First-year withdrawal divided by the number, or by invested money once retired. */
  withdrawalRate: number | null;
  alreadyRetired: boolean;
  /** Age the invested balance can no longer pay a year. Null when it does not run out. */
  lastsUntilAge: number | null;
};

const EMPTY: RetirementPlanResult = {
  error: null,
  impossible: false,
  number: null,
  living: 0,
  kids: 0,
  health: 0,
  house: 0,
  percent: null,
  firstYearNeed: null,
  withdrawalRate: null,
  alreadyRetired: false,
  lastsUntilAge: null,
};

/** Share of each college year left after child-account balances cover the total. */
export function collegeScale(
  children: PlanChild[],
  collegeAnnual: number,
  childBalances: number,
  currentYear: number,
): number {
  if (collegeAnnual <= 0) return 0;
  let gross = 0;
  for (const child of children) {
    if (child.birthYear == null) continue;
    for (let age = 18; age <= 21; age++) {
      if (child.birthYear + age >= currentYear) gross += collegeAnnual;
    }
  }
  if (gross <= 0) return 0;
  return Math.max(0, gross - Math.max(0, childBalances)) / gross;
}

type Parts = { living: number; kids: number; health: number; total: number };

/** The calendar year of a whole age. Ages count from the current whole age, so a part-year age never splits a child's year. */
function yearOf(age: number, ageNow: number, currentYear: number) {
  return currentYear + (age - Math.floor(ageNow));
}

function costsAt(
  year: number,
  input: RetirementPlanInput,
  scale: number,
): { kid: number; college: number } {
  let kid = 0;
  let college = 0;
  for (const child of input.children) {
    if (child.birthYear == null) continue;
    const age = year - child.birthYear;
    if (age >= 0 && age <= 17) kid += input.childAnnual;
    if (age >= 18 && age <= 21) college += input.collegeAnnual * scale;
  }
  return { kid, college };
}

function needAt(age: number, input: RetirementPlanInput, scale: number): Parts {
  const year = yearOf(age, input.ageNow, input.currentYear);
  const { kid, college } = costsAt(year, input, scale);
  const kidPart = kid + college;
  const healthPart = age < MEDICARE_AGE ? Math.max(0, input.healthcareAnnual ?? 0) : 0;
  const income = age >= input.otherIncomeAge ? input.otherIncome : 0;
  const raw = input.annualSpend + kidPart + healthPart - income;
  if (raw <= 0 || input.tax >= 1) return { living: 0, kids: 0, health: 0, total: 0 };
  const total = raw / (1 - input.tax);
  const denom = input.annualSpend + kidPart + healthPart;
  const kids = denom > 0 ? total * (kidPart / denom) : 0;
  const health = denom > 0 ? total * (healthPart / denom) : 0;
  return { living: total - kids - health, kids, health, total };
}

/** Kid and college costs in a calendar year, in today's money. */
export function kidCostIn(year: number, input: RetirementPlanInput): number {
  const scale = collegeScale(input.children, input.collegeAnnual, input.childBalances, input.currentYear);
  const { kid, college } = costsAt(year, input, scale);
  return kid + college;
}

function lastKidAge(input: RetirementPlanInput, retire: number): number | null {
  let last: number | null = null;
  for (const child of input.children) {
    if (child.birthYear == null) continue;
    for (let childAge = 0; childAge <= 21; childAge++) {
      const year = child.birthYear + childAge;
      if (year < input.currentYear) continue;
      const age = Math.floor(input.ageNow) + (year - input.currentYear);
      if (age >= retire) last = last == null ? age : Math.max(last, age);
    }
  }
  return last;
}

function discount(yearsOut: number, ra: number) {
  if (yearsOut <= 0) return 1;
  return 1 / (1 + ra) ** yearsOut;
}

export function retirementNumber(input: RetirementPlanInput): RetirementPlanResult {
  const retire = input.retireAge;
  const live = input.liveTo;
  if (!(live > retire)) return { ...EMPTY, error: "retire-after-live" };

  const ra = realReturn(input.returnAfter, input.inflation);
  const scale = collegeScale(input.children, input.collegeAnnual, input.childBalances, input.currentYear);
  const current = Math.floor(input.ageNow);
  const alreadyRetired = current >= retire;

  let living = 0;
  let kids = 0;
  let health = 0;
  const add = (age: number) => {
    const parts = needAt(age, input, scale);
    const d = discount(age - retire, ra);
    living += parts.living * d;
    kids += parts.kids * d;
    health += parts.health * d;
  };

  let impossible = false;
  if (!(1 + ra > 0)) {
    impossible = true;
  } else if (input.mode === "down") {
    for (let age = retire; age < live; age++) add(age);
  } else {
    const last = lastKidAge(input, retire);
    let cursor = retire;
    if (last != null) {
      for (let age = retire; age <= last; age++) add(age);
      cursor = last + 1;
    }
    if ((input.healthcareAnnual ?? 0) > 0 && cursor < MEDICARE_AGE) {
      for (let age = cursor; age < MEDICARE_AGE; age++) add(age);
      cursor = MEDICARE_AGE;
    }
    if (input.otherIncome > 0 && cursor < input.otherIncomeAge) {
      for (let age = cursor; age < input.otherIncomeAge; age++) add(age);
      cursor = input.otherIncomeAge;
    }
    const tail = needAt(cursor, input, scale).total;
    // Each year's money comes out at the start of that year, as in the years summed above: a perpetuity due.
    if (tail > 0 && ra <= 0) impossible = true;
    else if (tail > 0) living += ((tail * (1 + ra)) / ra) * discount(cursor - retire, ra);
  }

  let house = 0;
  if (
    !impossible &&
    input.housePrice != null &&
    input.housePrice > 0 &&
    input.houseAge != null &&
    input.houseAge >= retire &&
    1 + ra > 0
  ) {
    house = input.housePrice * discount(input.houseAge - retire, ra);
  }

  const number = impossible ? null : living + kids + health + house;
  const firstAge = alreadyRetired ? current : retire;
  const firstYearNeed = needAt(firstAge, input, scale).total;
  const base = alreadyRetired ? input.invested : number;
  const withdrawalRate = base != null && base > 0 ? firstYearNeed / base : null;
  const percent = number != null && number > 0 ? input.invested / number : null;

  let lastsUntilAge: number | null = null;
  if (alreadyRetired && 1 + ra > 0) {
    let bal = input.invested;
    const cap = input.mode === "down" ? live : current + 150;
    for (let age = current; age < cap; age++) {
      const need = needAt(age, input, scale).total;
      if (bal < need) {
        lastsUntilAge = age;
        break;
      }
      bal = (bal - need) * (1 + ra);
    }
    if (input.mode === "down" && lastsUntilAge == null) lastsUntilAge = live;
  } else if (alreadyRetired) {
    lastsUntilAge = current;
  }

  return {
    error: null,
    impossible,
    number,
    living: impossible ? 0 : living,
    kids: impossible ? 0 : kids,
    health: impossible ? 0 : health,
    house: impossible ? 0 : house,
    percent,
    firstYearNeed,
    withdrawalRate,
    alreadyRetired,
    lastsUntilAge,
  };
}

export type MilestoneInput = {
  invested: number;
  contribution: number;
  /** Real return in today's money, nominal growth in future dollars. */
  rate: number;
  growth: number;
  inflation: number;
  target: number | null;
  targetAge: number | null;
  ageNow: number;
  housePrice: number | null;
  houseAge: number | null;
  retireAge: number;
  todayMoney: boolean;
};

export type MilestoneResult = {
  status: "blank" | "reached" | "past" | "ok";
  /** Saving still required, in the units selected by today's money. */
  yearly: number | null;
  monthly: number | null;
  ageReached: number | null;
};

type Withdrawal = { year: number; amount: number };

function plannedHouse(input: MilestoneInput): Withdrawal | null {
  const { housePrice, houseAge, retireAge, ageNow, inflation, todayMoney } = input;
  if (housePrice == null || housePrice <= 0 || houseAge == null) return null;
  if (houseAge >= retireAge || houseAge <= ageNow) return null;
  const year = Math.round(houseAge - ageNow);
  if (year < 1) return null;
  const amount = todayMoney ? housePrice : housePrice * (1 + inflation) ** year;
  return { year, amount };
}

/** End-of-year contribution. A house bought that year is withdrawn after the contribution. */
function savingsNeeded(invested: number, target: number, rate: number, years: number, withdrawal: Withdrawal | null) {
  if (years <= 0) return invested >= target ? 0 : Number.POSITIVE_INFINITY;
  const grown = invested * (1 + rate) ** years;
  const withdrawn =
    withdrawal && withdrawal.year <= years ? withdrawal.amount * (1 + rate) ** (years - withdrawal.year) : 0;
  const gap = target - (grown - withdrawn);
  if (gap <= 0) return 0;
  if (Math.abs(rate) < 1e-12) return gap / years;
  return gap / (((1 + rate) ** years - 1) / rate);
}

/** `goalAt(year)` is the target in the same dollars as the balance that year: flat in today's money, growing with prices in future dollars. */
function ageReachedAt(
  invested: number,
  contribution: number,
  rate: number,
  goalAt: (year: number) => number,
  ageNow: number,
  withdrawal: Withdrawal | null,
): number | null {
  if (invested >= goalAt(0)) return Math.floor(ageNow);
  let bal = invested;
  const start = Math.floor(ageNow);
  for (let age = start + 1; age <= 100; age++) {
    const year = age - start;
    bal = bal * (1 + rate) + contribution;
    if (withdrawal && withdrawal.year === year) bal -= withdrawal.amount;
    if (bal >= goalAt(year)) return age;
  }
  return null;
}

export function milestone(input: MilestoneInput): MilestoneResult {
  const { target, targetAge, ageNow, invested, todayMoney, inflation } = input;
  if (target == null || targetAge == null) {
    return { status: "blank", yearly: null, monthly: null, ageReached: null };
  }
  const years = Math.round(targetAge - ageNow);
  if (years <= 0) return { status: "past", yearly: null, monthly: null, ageReached: null };
  if (invested >= target) {
    return { status: "reached", yearly: 0, monthly: 0, ageReached: Math.floor(ageNow) };
  }
  const rate = todayMoney ? input.rate : input.growth;
  const goal = todayMoney ? target : target * (1 + inflation) ** years;
  const withdrawal = plannedHouse(input);
  const yearly = savingsNeeded(invested, goal, rate, years, withdrawal);
  const goalAt = (year: number) => (todayMoney ? target : target * (1 + inflation) ** year);
  const ageReached = ageReachedAt(invested, input.contribution, rate, goalAt, ageNow, withdrawal);
  return { status: "ok", yearly, monthly: yearly / 12, ageReached };
}

export type PathPoint = {
  age: number;
  year: number;
  /** Balance at the start of that age, in today's money. */
  balance: number;
  /** Invested money plus every saving so far, in today's money. */
  contributed: number;
  /** Money in (+, saved that year) or out (−, spent from savings that year, a house included), in today's money. */
  flow: number;
};

/**
 * Year-by-year balance in today's money, from now to the live-to age.
 * Before retiring: grows at the real return, `saving` lands at year end, and a house bought before retiring comes out that year
 * (the same convention as milestones). From retirement on: each year's need comes out at the start of the year, then the rest grows
 * at the real return after retiring (the same convention as "how long it lasts"). Saving the required amount lands on the number.
 */
export function balancePath(input: RetirementPlanInput, saving: number): PathPoint[] {
  const rb = realReturn(input.growth, input.inflation);
  const ra = realReturn(input.returnAfter, input.inflation);
  const scale = collegeScale(input.children, input.collegeAnnual, input.childBalances, input.currentYear);
  const start = Math.floor(input.ageNow);
  const retire = Math.max(input.retireAge, start);
  const end = Math.max(retire + 1, input.liveTo);
  const house = input.housePrice != null && input.housePrice > 0 && input.houseAge != null ? { age: input.houseAge, price: input.housePrice } : null;

  let balance = input.invested;
  let contributed = input.invested;
  const kidNow = kidCostIn(input.currentYear, input);
  const points: PathPoint[] = [{ age: start, year: input.currentYear, balance, contributed, flow: 0 }];
  for (let age = start + 1; age <= end; age++) {
    const year = input.currentYear + (age - start);
    let flow: number;
    if (age <= retire) {
      // Kid costs above today's come out of what is saved that year; when a child leaves home, saving rises.
      const saved = saving - (kidCostIn(year - 1, input) - kidNow);
      balance = balance * (1 + rb) + saved;
      contributed += saved;
      flow = saved;
      if (house && Math.round(house.age) === age && house.age < retire) {
        balance -= house.price;
        flow -= house.price;
      }
    } else {
      const prev = age - 1;
      const need = needAt(prev, input, scale).total + (house && house.age >= retire && Math.round(house.age) === prev ? house.price : 0);
      balance = (balance - need) * (1 + ra);
      flow = -need;
    }
    points.push({ age, year, balance, contributed, flow });
  }
  return points;
}

/**
 * Yearly saving, in today's money and at today's kid costs, that reaches `target` by `retireAge`. Zero when invested money
 * already gets there. The balance at retirement rises in a straight line with the saving, so two runs of the path solve it.
 */
export function requiredSaving(input: RetirementPlanInput, target: number): number {
  const years = input.retireAge - Math.floor(input.ageNow);
  if (years <= 0) return 0;
  const at = (saving: number) => balancePath(input, saving).find((p) => p.age === input.retireAge)?.balance ?? 0;
  const base = at(0);
  const perDollar = at(1) - base;
  if (!(perDollar > 0)) return 0;
  return Math.max(0, (target - base) / perDollar);
}

/** The earliest retire age, up to `latest`, whose required saving fits within `saving`. Null when none does. */
export function earliestRetireAge(input: RetirementPlanInput, saving: number, latest = 80): number | null {
  for (let age = Math.floor(input.ageNow) + 1; age <= latest; age++) {
    if (age >= input.liveTo) return null;
    const plan = { ...input, retireAge: age };
    const result = retirementNumber(plan);
    if (result.error != null || result.impossible || result.number == null) continue;
    if (requiredSaving(plan, result.number) <= saving + 0.5) return age;
  }
  return null;
}

/** First age the path reaches `amount` (today's money). The current age when it already has; null when it never does. */
export function ageAtAmount(path: PathPoint[], amount: number): number | null {
  const hit = path.find((point) => point.balance >= amount);
  return hit ? hit.age : null;
}

/** The yearly spending in retirement that `saving` can support, so the balance lands on the number for that spending. Null when none can. */
export function affordableSpend(input: RetirementPlanInput, saving: number): number | null {
  const fits = (spend: number) => {
    const plan = { ...input, annualSpend: spend };
    const result = retirementNumber(plan);
    if (result.error != null || result.impossible || result.number == null) return false;
    return requiredSaving(plan, result.number) <= saving + 0.5;
  };
  if (!fits(0)) return null;
  let low = 0;
  let high = Math.max(10_000, input.annualSpend * 2);
  while (fits(high) && high < 1e9) {
    low = high;
    high *= 2;
  }
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * What the years from retiring until retirement accounts open without penalty cost, valued at the retire age.
 * Zero when retiring at or after that age.
 */
export function bridgeCost(input: RetirementPlanInput): number {
  const retire = input.retireAge;
  if (retire >= PENALTY_FREE_AGE) return 0;
  const ra = realReturn(input.returnAfter, input.inflation);
  const scale = collegeScale(input.children, input.collegeAnnual, input.childBalances, input.currentYear);
  let total = 0;
  for (let age = retire; age < PENALTY_FREE_AGE; age++) total += needAt(age, input, scale).total * discount(age - retire, ra);
  return total;
}
