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

export type RetirementSnapshot = {
  retireAge: number;
  /** False when no birthdate is set and the plan counts years from an assumed age. */
  ageKnown: boolean;
  retireYear: number;
  number: number | null;
  needed: number | null;
  saving: number | null;
  /** Earliest age the current saving reaches the number. */
  paceAge: number | null;
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
}): RetirementSnapshot {
  const { prefs } = input;
  const D = PLAN_DEFAULTS;
  const withDob = input.holders.filter((h) => h.birthdate);
  const holderKey = prefs.holderKey && withDob.some((h) => h.key === prefs.holderKey) ? prefs.holderKey : (withDob[0]?.key ?? "A");
  const holder = input.holders.find((h) => h.key === holderKey) ?? input.holders[0];
  const ageNow = holder?.birthdate ? holderAge(holder.birthdate, input.today) : null;
  const currentYear = Number(input.today.slice(0, 4));
  const minRetire = ageNow == null ? D.retireMin : Math.max(D.retireMin, Math.floor(ageNow) + 1);
  const maxRetire = Math.max(D.retireMax, minRetire);
  const retireAge =
    ageNow == null
      ? D.assumedAge + (prefs.yearsFallback ?? D.yearsFallback)
      : Math.min(maxRetire, Math.max(minRetire, prefs.retireAge ?? D.retireAge));
  const planAge = ageNow ?? D.assumedAge;
  const houseAtRetire = prefs.houseAtRetire !== false;
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
    housePrice: prefs.housePrice ?? null,
    houseAge: houseAtRetire ? retireAge : (prefs.houseAge ?? null),
    otherIncome: prefs.otherIncome ?? 0,
    otherIncomeAge: prefs.otherIncomeAge ?? D.otherIncomeAge,
    tax: (prefs.taxPct ?? D.taxPct) / 100,
    healthcareAnnual: prefs.healthcareAnnual ?? D.healthcareAnnual,
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
    retireYear: currentYear + Math.max(0, Math.round(retireAge - planAge)),
    number,
    needed,
    saving,
    paceAge,
  };
}
