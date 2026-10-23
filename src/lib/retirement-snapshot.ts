// The planner's answer without the page: the same defaults and math as the Retirement planner,
// so Insights can show its verdict and the two never disagree.
import type { PlanChildPref, ProjectionPrefs } from "./projection-prefs";
import {
  earliestRetireAge,
  holderAge,
  requiredSaving,
  retirementNumber,
  type RetirementPlanInput,
} from "./retirement-plan";
import { SAVE_MONTHS } from "./equity-comp";
import { expensesForPlan, plannedExpenses } from "./plan-expenses";
import { inPriorMonths } from "./range";

export const PLAN_DEFAULTS = {
  rate: 7,
  retireAge: 60,
  yearsFallback: 25,
  inflation: 3,
  liveTo: 95,
  childAnnual: 25_000,
  collegeAnnual: 70_000,
  otherIncomeAge: 67,
  taxPct: 15,
  healthcareAnnual: 20_000,
  /** Youngest retire age on the slider. */
  retireMin: 35,
  /** Oldest retire age on the slider. */
  retireMax: 65,
  /** Age assumed when no birthdate is set. */
  assumedAge: 40,
} as const;

/** Planned children stay; the household's children come from Settings with any birth year saved for them. */
export function mergeChildren(saved: PlanChildPref[] | undefined, household: { id: string; name: string }[]): PlanChildPref[] {
  const stored = saved ?? [];
  const known = household.map((child) => {
    const prev = stored.find((row) => row.id === child.id);
    return { id: child.id, name: child.name, birthYear: prev?.birthYear ?? null, planned: false };
  });
  const planned = stored.filter((row) => row.planned && !household.some((child) => child.id === row.id));
  return [...known, ...planned];
}

/**
 * What the household saves a year now: regular take-home pay and stock vests, minus all spending, plus
 * retirement contributions and stock-plan purchases (both come out of pay before take-home).
 * Vests, spending, contributions, and ESPP are the three complete months before this one, times 4.
 */
export function estimateSaving(input: {
  payAnnual: number;
  spendAnnual: number | null;
  /** Retirement contributions from the three complete months before this one, already times 4. */
  contributionsAnnual: number;
  /** RSU vests from those three months, already times 4. */
  vestAnnual?: number;
  /** ESPP purchases from those three months, already times 4. */
  esppAnnual?: number;
  now: Date;
}) {
  if (!(input.payAnnual > 0) || input.spendAnnual == null) return null;
  const yearFraction = Math.max(
    1 / 12,
    (input.now.getTime() - Date.UTC(input.now.getUTCFullYear(), 0, 1)) / (365.25 * 86_400_000),
  );
  const contributions = Math.max(0, input.contributionsAnnual);
  const vests = Math.max(0, input.vestAnnual ?? 0);
  const espp = Math.max(0, input.esppAnnual ?? 0);
  return { amount: input.payAnnual + vests - input.spendAnnual + contributions + espp, contributions, vests, espp, yearFraction };
}

/** Retirement contributions in the three complete months before this one. Times 4 is the year. */
export function contributionsPriorQuarter(rows: { contributions: { date: string; amount: number }[] }[], now: Date) {
  return rows.reduce(
    (sum, row) => sum + row.contributions.filter((c) => inPriorMonths(c.date, now, SAVE_MONTHS)).reduce((s, c) => s + c.amount, 0),
    0,
  );
}

export type PartnerRetire = {
  key: "A" | "B";
  ageNow: number;
  /** Their own retire age. */
  retireAge: number;
  retireYear: number;
  /** Slider bounds on their own age. */
  min: number;
  max: number;
};

export type RetireTiming = {
  /** Whose age the planner's timeline counts in. */
  holderKey: "A" | "B";
  /** That person's age today; null without a birthdate. */
  ageNow: number | null;
  planAge: number;
  currentYear: number;
  /** Bounds of the single retire slider, on the timeline's age. */
  minRetire: number;
  maxRetire: number;
  /** When the household is fully retired, on the timeline's age. */
  retireAge: number;
  retireYear: number;
  /** Each partner's own retire age, when both birthdates are known. */
  partners: [PartnerRetire, PartnerRetire] | null;
  /** The partner who stops working first, when the two retire in different years. Age is on the timeline. */
  early: {
    key: "A" | "B";
    age: number;
    year: number;
    pay: number;
    /** The household typed this partner's pay. */
    payOwn: boolean;
    /** Otherwise it is the paychecks that are theirs; false when none are known, and pay is 0 until some are. */
    payFromPaychecks: boolean;
  } | null;
};

/**
 * Each partner's yearly take-home pay from the paychecks that are theirs: by what the household marked, or else by the
 * partner whose own account they land in. Pay into a joint account is nobody's until it is marked.
 */
export function partnerPay(
  sources: { label: string; amount: number; perYear: number; partner: "A" | "B" | null }[],
  marks?: Record<string, "A" | "B"> | null,
) {
  const out = { A: 0, B: 0, unmarked: 0 };
  for (const s of sources) {
    const who = marks?.[s.label] ?? s.partner;
    const yearly = s.amount * s.perYear;
    if (who === "A") out.A += yearly;
    else if (who === "B") out.B += yearly;
    else out.unmarked += yearly;
  }
  return out;
}

/**
 * When each partner retires, worked out once for the planner and for every page that shows its verdict.
 * Without a partner's own retire age, both retire the year the household's single retire age gives, as before.
 */
export function retireTiming(input: {
  prefs: ProjectionPrefs;
  holders: { key: "A" | "B"; birthdate: string | null }[];
  today: string;
  /** Each partner's take-home pay a year from their own paychecks (partnerPay), for one who stops first. */
  partnerPay?: { A: number; B: number } | null;
}): RetireTiming {
  const { prefs } = input;
  const D = PLAN_DEFAULTS;
  const withDob = input.holders.filter((h) => h.birthdate);
  const holderKey = prefs.holderKey && withDob.some((h) => h.key === prefs.holderKey) ? prefs.holderKey : (withDob[0]?.key ?? "A");
  const holder = input.holders.find((h) => h.key === holderKey) ?? input.holders[0];
  const ageNow = holder?.birthdate ? holderAge(holder.birthdate, input.today) : null;
  const currentYear = Number(input.today.slice(0, 4));
  const minRetire = ageNow == null ? D.retireMin : Math.max(D.retireMin, Math.floor(ageNow) + 1);
  // A year kept when a birthdate is typed in or cleared can sit past 65 (or past 25 years with no birthdate).
  // The slider's end moves out to that saved choice, the way an older partner stays pinned, until it is moved.
  const maxRetire = Math.max(D.retireMax, minRetire, ageNow != null && prefs.retireAge != null ? prefs.retireAge : 0);
  const planAge = ageNow ?? D.assumedAge;
  const years = Math.max(0, prefs.yearsFallback ?? D.yearsFallback);
  const single =
    ageNow == null
      ? planAge + years
      : Math.min(maxRetire, Math.max(minRetire, prefs.retireAge ?? D.retireAge));
  // Whole years, as the plan counts them: someone 40 now is 60 twenty calendar years on.
  const singleYear = currentYear + Math.max(0, single - Math.floor(planAge));
  const base = { holderKey, ageNow, planAge, currentYear, minRetire, maxRetire };

  const people = input.holders.filter((h): h is { key: "A" | "B"; birthdate: string } => Boolean(h.birthdate));
  if (ageNow == null || people.length < 2) {
    return { ...base, retireAge: single, retireYear: singleYear, partners: null, early: null };
  }
  const partners = people.slice(0, 2).map((person): PartnerRetire => {
    const now = holderAge(person.birthdate, input.today);
    const min = Math.max(D.retireMin, Math.floor(now) + 1);
    const own = person.key === "A" ? prefs.retireAgeA : prefs.retireAgeB;
    // Unset: the age they'll be the year the household retires. Kept even past the slider's end, so nothing moves.
    const sameYear = Math.floor(now) + (singleYear - currentYear);
    // A saved age past 65 (an older partner pinned where the same year put them) keeps its own end of the range.
    const max = Math.max(D.retireMax, min, own ?? sameYear);
    const retireAge = own == null ? Math.max(min, sameYear) : Math.min(max, Math.max(min, own));
    return { key: person.key, ageNow: now, retireAge, retireYear: currentYear + (retireAge - Math.floor(now)), min, max };
  }) as [PartnerRetire, PartnerRetire];
  const [first, last] = [...partners].sort((a, b) => a.retireYear - b.retireYear);
  const toTimeline = (year: number) => Math.floor(ageNow) + (year - currentYear);
  const retireYear = last.retireYear;
  let early: RetireTiming["early"] = null;
  if (first.retireYear < last.retireYear) {
    const own = first.key === "A" ? prefs.stopPayA : prefs.stopPayB;
    const theirs = Math.round(input.partnerPay?.[first.key] ?? 0);
    const pay = own ?? theirs;
    early = { key: first.key, age: toTimeline(first.retireYear), year: first.retireYear, pay, payOwn: own != null, payFromPaychecks: own == null && theirs > 0 };
  }
  return { ...base, retireAge: toTimeline(retireYear), retireYear, partners, early };
}

/**
 * Saved planner choices that keep the household's retire year when birthdates come or go, so typing one in (or clearing
 * one) never rewrites the plan. Null while the same people have birthdates: an age someone chose stays theirs, even when
 * a birthdate is corrected. Per-partner ages left from an earlier time both birthdates were set are cleared, so both
 * partners start on the household's year again.
 */
export function keepRetireYear(input: {
  prefs: ProjectionPrefs;
  before: { key: "A" | "B"; birthdate: string | null }[];
  after: { key: "A" | "B"; birthdate: string | null }[];
  today: string;
}): ProjectionPrefs | null {
  const known = (list: typeof input.before) => list.filter((h): h is { key: "A" | "B"; birthdate: string } => Boolean(h.birthdate));
  const had = known(input.before).map((h) => h.key).join();
  const people = known(input.after);
  if (had === people.map((h) => h.key).join()) return null;
  const year = retireTiming({ prefs: input.prefs, holders: input.before, today: input.today }).retireYear;
  const currentYear = Number(input.today.slice(0, 4));
  const cleared: ProjectionPrefs = { retireAgeA: null, retireAgeB: null };
  if (!people.length) {
    // The years slider normally stops at 25. A later year is kept by letting this one choice sit past that end.
    return { ...cleared, yearsFallback: Math.max(1, year - currentYear) };
  }
  // The timeline stays on the same person when they still have a birthdate, so the single slider means what it did.
  const wasHolder = retireTiming({ prefs: input.prefs, holders: input.before, today: input.today }).holderKey;
  const holder = people.find((h) => h.key === wasHolder) ?? people[0];
  return { ...cleared, holderKey: holder.key, retireAge: Math.floor(holderAge(holder.birthdate, input.today)) + (year - currentYear) };
}

export type RetirementSnapshot = {
  retireAge: number;
  /** False when no birthdate is set and the plan counts years from an assumed age. */
  ageKnown: boolean;
  retireYear: number;
  number: number | null;
  needed: number | null;
  saving: number | null;
  /** Earliest age the current saving reaches the number. With partners retiring apart, both move by the same years. */
  paceAge: number | null;
  /** Each partner's own retire age, when the planner has both birthdates. Null otherwise. */
  partners?: { key: "A" | "B"; retireAge: number; retireYear: number }[] | null;
};

export function retirementSnapshot(input: {
  prefs: ProjectionPrefs;
  holders: { key: "A" | "B"; birthdate: string | null }[];
  today: string;
  investedDefault: number;
  spendNow: number | null;
  saveNow: number | null;
  childBalances: number;
  householdChildren: { id: string; name: string }[];
  /** Each partner's take-home pay a year from their own paychecks, for one who stops first without a typed figure. */
  partnerPay?: { A: number; B: number } | null;
}): RetirementSnapshot {
  const { prefs } = input;
  const D = PLAN_DEFAULTS;
  const timing = retireTiming({ prefs, holders: input.holders, today: input.today, partnerPay: input.partnerPay });
  const { ageNow, currentYear, retireAge, planAge } = timing;
  const rate = prefs.rate ?? D.rate;
  const liveTo = prefs.liveTo ?? D.liveTo;
  const invested = prefs.invested != null ? Math.round(prefs.invested / 10_000) * 10_000 : Math.round(input.investedDefault / 10_000) * 10_000;
  const kids = mergeChildren(prefs.planChildren, input.householdChildren);

  const plan: RetirementPlanInput = {
    ageNow: planAge,
    currentYear,
    growth: rate / 100,
    inflation: (prefs.inflation ?? D.inflation) / 100,
    returnAfter: (prefs.returnAfter ?? rate - 2) / 100,
    retireAge,
    liveTo,
    mode: prefs.spendMode ?? "forever",
    invested,
    annualSpend: prefs.annualSpend ?? input.spendNow ?? 0,
    childAnnual: prefs.childAnnual ?? D.childAnnual,
    collegeAnnual: prefs.collegeAnnual ?? D.collegeAnnual,
    children: kids.map((k) => ({ birthYear: k.birthYear })),
    childBalances: input.childBalances,
    expenses: expensesForPlan(plannedExpenses(prefs, { retireYear: timing.retireYear, currentYear, planAge }), { currentYear, planAge }),
    wageGrowth: prefs.wageGrowth != null ? prefs.wageGrowth / 100 : undefined,
    otherIncome: prefs.otherIncome ?? 0,
    otherIncomeAge: prefs.otherIncomeAge ?? D.otherIncomeAge,
    tax: (prefs.taxPct ?? D.taxPct) / 100,
    healthcareAnnual: prefs.healthcareAnnual ?? D.healthcareAnnual,
    earlyStop: timing.early ? { age: timing.early.age, pay: timing.early.pay } : null,
  };
  const result = retirementNumber(plan);
  const valid = result.error == null && !result.impossible && result.number != null && result.number > 0;
  const number = valid ? result.number! : null;
  const needed = number != null ? requiredSaving(plan, number) : null;
  const saving = prefs.saveOverride ?? input.saveNow;
  const paceAge = number != null && saving != null ? earliestRetireAge(plan, Math.max(0, saving), liveTo - 1) : null;
  return {
    retireAge,
    ageKnown: ageNow != null,
    retireYear: timing.retireYear,
    partners: timing.partners ? timing.partners.map((p) => ({ key: p.key, retireAge: p.retireAge, retireYear: p.retireYear })) : null,
    number,
    needed,
    saving,
    paceAge,
  };
}
