"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, CircleAlert, CircleCheck, CircleHelp, Info, Plus, X } from "lucide-react";
import { Money } from "@/components/money";
import { NumberField, Segmented } from "@/components/number-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { formatApprox, formatMoney, formatPct, formatWhole, roundApprox } from "@/lib/format";
import type { PlanChildPref, ProjectionPrefs } from "@/lib/projection-prefs";
import {
  affordableSpend,
  balancePath,
  bridgeCost,
  kidCostIn,
  MEDICARE_AGE,
  PENALTY_FREE_AGE,
  earliestRetireAge,
  holderAge,
  IMPOSSIBLE_MESSAGE,
  requiredSaving,
  retirementNumber,
  type PathPoint,
  type RetirementPlanInput,
} from "@/lib/retirement-plan";

export type Holder = { key: "A" | "B"; name: string; birthdate: string | null };

/** What the household saves in a year now, and every part it comes from, so the page can show its working. */
export type SaveNow = {
  amount: number;
  /** Regular take-home pay a year, bonuses dropped. */
  pay: number;
  paySources: { label: string; amount: number; cadence: string; perYear: number }[];
  /** All spending a year, loan payments included. */
  spend: number;
  /** Spending over `basis`, before scaling to a year by `factor`. */
  spendPeriod: number;
  loans: number;
  factor: number;
  contributions: number;
  contributionsYtd: number;
  /** Share of the year gone, which scales this year's contributions to a full year. */
  yearFraction: number;
  basis: string;
};

const LIVING = "#7EABD4";
const KIDS = "#D4BE7A";
const HOUSE = "#C99AB0";
const HEALTH = "#8FC7A0";
/** Target path: the least saving that lands on the number. Your path: what you save now. */
const TARGET_LINE = "#D4BE7A";
const YOUR_LINE = "#7EABD4";
/** Weak and strong markets sit this far either side of the growth and after-retiring returns. */
const MARKET_SWING = 0.02;
const AXIS = { fontSize: 11, fill: "#8fa0b8", fontFamily: "var(--font-geist-sans)" };
const GRID = "rgba(148,163,184,0.12)";
const RETIRE_MIN = 35;
const RETIRE_MAX = 65;
/** When the money lasts for good, the chart stops here so the years that matter fill it. */
const FOREVER_CHART_END = 80;
/** Without birthdates the planner assumes this age today, and the slider moves only the retirement year. */
const ASSUMED_AGE = 40;

/** Saves edits a moment after typing stops, and on leaving the page. */
function usePersist() {
  const pending = useRef<ProjectionPrefs>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const body = pending.current;
    if (Object.keys(body).length === 0) return;
    pending.current = {};
    void fetch("/api/household", {
      method: "PATCH",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectionPrefs: body }),
    });
  }, []);
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);
  return useCallback(
    (patch: ProjectionPrefs) => {
      Object.assign(pending.current, patch);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 500);
    },
    [flush],
  );
}

function mergeChildren(saved: PlanChildPref[] | undefined, household: { id: string; name: string }[]): PlanChildPref[] {
  const stored = saved ?? [];
  const known = household.map((child) => {
    const prev = stored.find((row) => row.id === child.id);
    return { id: child.id, name: child.name, birthYear: prev?.birthYear ?? null, planned: false };
  });
  const planned = stored.filter((row) => row.planned && !household.some((child) => child.id === row.id));
  return [...known, ...planned];
}

function roundInvested(n: number) {
  return Math.round(n / 10_000) * 10_000;
}

function fmtRate(n: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)}%`;
}

function compact(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 3 }).format(n);
}

/** Round axis steps: 1, 2, 2.5, or 5 times a power of ten. */
function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((m) => m >= raw) ?? 10 * power;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

export function RetirementPlan({
  accounts,
  childAccounts,
  saveNow,
  holders,
  today,
  saved,
  investedDefault,
  lockedDefault,
  netWorth,
  spendNow,
  childBalances,
  householdChildren,
}: {
  /** The accounts table. Null when there are no retirement accounts. */
  accounts: ReactNode;
  /** Child accounts and notes, between the top cards and the planner. */
  childAccounts: ReactNode;
  saveNow: SaveNow | null;
  holders: Holder[];
  today: string;
  saved: ProjectionPrefs;
  investedDefault: number;
  /** Of that, what sits in retirement accounts, which can't be drawn without penalty before 59½. */
  lockedDefault: number;
  netWorth: number;
  /** Yearly spending today without loan payments, the starting point for Spend a year. Null without transactions. */
  spendNow: number | null;
  childBalances: number;
  householdChildren: { id: string; name: string }[];
}) {
  const persist = usePersist();
  const withDob = holders.filter((holder) => holder.birthdate);
  const [holderKey, setHolderKey] = useState<"A" | "B">(
    saved.holderKey && withDob.some((holder) => holder.key === saved.holderKey) ? saved.holderKey : (withDob[0]?.key ?? "A"),
  );
  const [rate, setRate] = useState(saved.rate ?? 7);
  const [retireAgeSaved, setRetireAge] = useState(saved.retireAge ?? 60);
  const [yearsFallback, setYearsFallback] = useState(saved.yearsFallback ?? 25);
  const [inflation, setInflation] = useState(saved.inflation ?? 3);
  // Invested is a planning figure, rounded to the nearest $10,000 like the rest of the planner.
  const investedRounded = roundInvested(investedDefault);
  // Without a figure of its own, Invested follows the accounts, so a price refresh updates it too.
  const [investedOwn, setInvestedOwn] = useState<number | null>(saved.invested != null ? roundInvested(saved.invested) : null);
  const invested = investedOwn ?? investedRounded;
  const setInvested = (v: number | null) => {
    setInvestedOwn(v);
    persist({ invested: v });
  };
  const [annualSpend, setAnnualSpend] = useState(saved.annualSpend ?? spendNow ?? 0);
  const [liveTo, setLiveTo] = useState(saved.liveTo ?? 95);
  const [mode, setMode] = useState<"forever" | "down">(saved.spendMode ?? "forever");
  const [childAnnual, setChildAnnual] = useState(saved.childAnnual ?? 25_000);
  const [collegeAnnual, setCollegeAnnual] = useState(saved.collegeAnnual ?? 70_000);
  const [kids, setKids] = useState<PlanChildPref[]>(() => mergeChildren(saved.planChildren, householdChildren));
  const [housePrice, setHousePrice] = useState<number | null>(saved.housePrice ?? null);
  const [houseAgeSaved, setHouseAge] = useState<number | null>(saved.houseAge ?? null);
  const [houseAtRetire, setHouseAtRetire] = useState(saved.houseAtRetire !== false);
  const [otherIncome, setOtherIncome] = useState(saved.otherIncome ?? 0);
  const [otherIncomeAge, setOtherIncomeAge] = useState(saved.otherIncomeAge ?? 67);
  const [taxPct, setTaxPct] = useState(saved.taxPct ?? 15);
  const [returnAfter, setReturnAfter] = useState<number | null>(saved.returnAfter ?? null);
  const [todayMoney, setTodayMoney] = useState(saved.todayMoney !== false);
  const [saveOverride, setSaveOverride] = useState<number | null>(saved.saveOverride ?? null);
  const [healthcareAnnual, setHealthcareAnnual] = useState(saved.healthcareAnnual ?? 20_000);

  /** One setter per saved value: update the page now, save shortly after. */
  function bind<K extends keyof ProjectionPrefs>(key: K, set: (v: NonNullable<ProjectionPrefs[K]>) => void) {
    return (v: NonNullable<ProjectionPrefs[K]>) => {
      set(v);
      persist({ [key]: v } as ProjectionPrefs);
    };
  }

  const holder = holders.find((item) => item.key === holderKey) ?? holders[0];
  const ageNow = holder?.birthdate ? holderAge(holder.birthdate, today) : null;
  const currentYear = Number(today.slice(0, 4));
  // Retire age runs from next year of age to 65. A saved age outside that range is shown at the nearest end.
  const minRetire = ageNow == null ? RETIRE_MIN : Math.max(RETIRE_MIN, Math.floor(ageNow) + 1);
  const maxRetire = Math.max(RETIRE_MAX, minRetire);
  const retireAge = ageNow == null ? ASSUMED_AGE + yearsFallback : Math.min(maxRetire, Math.max(minRetire, retireAgeSaved));
  const planAge = ageNow ?? ASSUMED_AGE;
  // By default the house is bought the year you retire, and moves with the slider.
  const houseAge = houseAtRetire ? retireAge : houseAgeSaved;
  const retireYear = currentYear + Math.max(0, Math.round(retireAge - planAge));
  const returnShown = returnAfter ?? rate - 2;

  const input: RetirementPlanInput = {
    ageNow: planAge,
    currentYear,
    growth: rate / 100,
    inflation: inflation / 100,
    returnAfter: returnShown / 100,
    retireAge,
    liveTo,
    mode,
    invested,
    annualSpend,
    childAnnual,
    collegeAnnual,
    children: kids.map((kid) => ({ birthYear: kid.birthYear })),
    childBalances,
    housePrice,
    houseAge,
    otherIncome,
    otherIncomeAge,
    tax: taxPct / 100,
    healthcareAnnual,
  };
  const result = retirementNumber(input);
  const valid = result.error == null && !result.impossible && result.number != null && result.number > 0;
  const number = valid ? result.number! : null;
  const needed = number != null ? requiredSaving(input, number) : null;
  const planPath = needed != null ? balancePath(input, needed) : null;
  // What the household saves: its own figure when it gave one, otherwise the estimate from pay and spending.
  const saving = saveOverride ?? (saveNow != null ? saveNow.amount : null);
  const pacePath = number != null && saving != null ? balancePath(input, Math.max(0, saving)) : null;
  const latestRetire = ageNow != null ? maxRetire : ASSUMED_AGE + 40;
  const paceAge = number != null && saving != null ? earliestRetireAge(input, Math.max(0, saving), liveTo - 1) : null;

  // Your path is what you save now; without that, the target path stands in for it.
  const yourSaving = saving != null ? Math.max(0, saving) : (needed ?? 0);
  const swing = (by: number): RetirementPlanInput => ({ ...input, growth: input.growth + by, returnAfter: input.returnAfter + by });
  const weakPath = number != null ? balancePath(swing(-MARKET_SWING), yourSaving) : null;
  const strongPath = number != null ? balancePath(swing(MARKET_SWING), yourSaving) : null;
  const weakRunsOut = weakPath ? (weakPath.find((p) => p.age > retireAge && p.age < liveTo && p.balance <= 0)?.age ?? null) : null;
  const affordable = saving != null && number != null ? affordableSpend(input, Math.max(0, saving)) : null;

  // Levers: what one change would do, worked out with the same math.
  const neededFor = (change: Partial<RetirementPlanInput>) => {
    const next = { ...input, ...change };
    const r = retirementNumber(next);
    return r.error == null && !r.impossible && r.number != null && r.number > 0 ? requiredSaving(next, r.number) : null;
  };
  const later = retireAge + 1 <= latestRetire ? { age: retireAge + 1, needed: neededFor({ retireAge: retireAge + 1 }) } : null;
  const earlier = !later && retireAge - 1 >= (ageNow != null ? minRetire : ASSUMED_AGE + 1) ? { age: retireAge - 1, needed: neededFor({ retireAge: retireAge - 1 }) } : null;
  const spendLess = annualSpend > 5_000 ? neededFor({ annualSpend: annualSpend - 5_000 }) : null;
  const saveMoreAge = saving != null && number != null ? earliestRetireAge(input, Math.max(0, saving) + 10_000, liveTo - 1) : null;

  // Before 59½, spending has to come from money outside retirement accounts.
  const lockedShare = investedDefault > 0 ? Math.min(1, Math.max(0, lockedDefault / investedDefault)) : 0;
  const atRetire = (pacePath ?? planPath)?.find((p) => p.age === retireAge)?.balance ?? null;
  const bridge = number != null ? bridgeCost(input) : 0;
  const reachable = atRetire != null ? Math.max(0, atRetire) * (1 - lockedShare) : null;

  function updateKids(next: PlanChildPref[]) {
    setKids(next);
    persist({ planChildren: next });
  }

  const kidsChange = Array.from({ length: Math.max(0, retireYear - currentYear) }, (_, i) => currentYear + 1 + i).some(
    (year) => Math.abs(kidCostIn(year, input) - kidCostIn(currentYear, input)) > 0.5,
  );
  const paceNumber = paceAge != null && paceAge < retireAge ? retirementNumber({ ...input, retireAge: paceAge }).number : null;
  const retireFor = (age: number) => (ageNow != null ? `retire at ${age}` : `retire in ${currentYear + (age - Math.floor(planAge))}`);
  const setRetire = (age: number) => (ageNow != null ? bind("retireAge", setRetireAge)(age) : bind("yearsFallback", setYearsFallback)(age - ASSUMED_AGE));

  const lastKidYear = kids.reduce<number | null>((last, kid) => (kid.birthYear == null ? last : Math.max(last ?? 0, kid.birthYear + 21)), null);

  return (
    <>
      {accounts}

      {childAccounts}

      <Card>
        <CardHeader>
          <CardTitle>Retirement planner</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="planner-layout">
          <div className="min-w-0">
          <PlannerAnswer
            result={result}
            number={number}
            needed={needed}
            saveNow={saveNow}
            saving={saving}
            saveOverride={saveOverride}
            onSaveOverride={(v) => {
              setSaveOverride(v);
              persist({ saveOverride: v });
            }}
            paceAge={paceAge}
            affordable={affordable}
            mode={mode}
            invested={invested}
            annualSpend={annualSpend}
            retireAge={retireAge}
            retireText={retireFor(retireAge)}
            retireFor={retireFor}
            latestRetire={latestRetire}
            liveTo={liveTo}
            rate={rate}
            inflation={inflation}
            levers={{
              later: later ?? earlier,
              spendLess,
              saveMoreAge,
              onRetire: setRetire,
              onSpend: () => bind("annualSpend", setAnnualSpend)(annualSpend - 5_000),
              onSaveMore: () => {
                const next = Math.round(Math.max(0, saving ?? 0)) + 10_000;
                setSaveOverride(next);
                persist({ saveOverride: next });
              },
            }}
            kidsChange={kidsChange}
          />

          <div className="mt-6 border-t border-border pt-6">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              {ageNow != null ? (
                <RetireSlider
                  value={retireAge}
                  min={minRetire}
                  max={maxRetire}
                  label={`Retire at ${retireAge}`}
                  note={`${retireYear}, when ${holder.name} is ${retireAge}`}
                  onChange={bind("retireAge", setRetireAge)}
                />
              ) : (
                <RetireSlider
                  value={yearsFallback}
                  min={1}
                  max={40}
                  label={`Retire in ${yearsFallback} ${yearsFallback === 1 ? "year" : "years"}`}
                  note={
                    <>
                      In {retireYear}. Ages below assume you are {Math.floor(planAge)} today; add birthdates in{" "}
                      <Link href="/settings" className="underline">
                        Settings
                      </Link>{" "}
                      to use real ones.
                    </>
                  }
                  onChange={bind("yearsFallback", setYearsFallback)}
                />
              )}
              {withDob.length > 1 ? (
                <div className="field">
                  <span className="kicker">Ages are</span>
                  <Segmented
                    label="Whose age"
                    value={holderKey}
                    onChange={bind("holderKey", setHolderKey)}
                    options={withDob.map((person) => ({ value: person.key, label: person.name }))}
                  />
                </div>
              ) : null}
            </div>

            <PlanChecks
              yours={saving != null}
              mode={mode}
              liveTo={liveTo}
              weak={{ growth: rate - MARKET_SWING * 100, runsOut: weakRunsOut, ageText: (age: number) => (ageNow != null ? `at ${age}` : `in ${currentYear + (age - Math.floor(planAge))}`) }}
              bridge={number != null && retireAge < PENALTY_FREE_AGE && bridge > 0 && reachable != null ? { cost: bridge, reachable, locked: lockedShare } : null}
              invested={invested}
            />

            {planPath ? (
              <PlannerChart
                target={planPath}
                yours={pacePath}
                weak={weakPath}
                strong={strongPath}
                needed={needed ?? 0}
                yourSaving={saving != null ? Math.max(0, saving) : null}
                number={number}
                paceAge={paceAge != null && paceAge < retireAge ? paceAge : null}
                paceNumber={paceNumber}
                endAge={mode === "forever" ? Math.max(FOREVER_CHART_END, retireAge + 10) : liveTo}
                liveTo={liveTo}
                incomeAge={otherIncome > 0 ? otherIncomeAge : null}
                medicare={healthcareAnnual > 0 && retireAge < MEDICARE_AGE ? MEDICARE_AGE : null}
                onToggle={bind("todayMoney", setTodayMoney)}
                retireAge={retireAge}
                houseAge={housePrice != null && houseAge != null && houseAge > planAge ? houseAge : null}
                kids={kids
                  .filter((kid): kid is PlanChildPref & { birthYear: number } => kid.birthYear != null)
                  .map((kid) => ({ name: kid.name || "Planned child", birthYear: kid.birthYear }))}
                kidCost={(year) => kidCostIn(year, input) - kidCostIn(currentYear, input)}
                childAnnual={childAnnual}
                collegeAnnual={collegeAnnual}
                byAge={ageNow != null}
                todayMoney={todayMoney}
                inflation={inflation / 100}
              />
            ) : null}

          </div>
          </div>

          <div className="planner-inputs">
            <div className="planner-spend min-w-0">
              <section className="form-section">
                <div className="kicker">Spend</div>
                <div className="field-grid field-grid-wide">
                  <NumberField
                    label="Invested"
                    prefix="$"
                    money
                    value={invested}
                    min={-1e12}
                    max={1e12}
                    onValue={(v) => setInvested(roundInvested(v ?? 0))}
                    help={
                      investedOwn != null && investedOwn !== investedRounded ? (
                        <button type="button" className="cursor-pointer py-0.5 text-left underline" onClick={() => setInvested(null)}>
                          Your cash and investments now total about <Money value={investedRounded} approx />. Use that.
                        </button>
                      ) : (
                        <>
                          Cash and investments, to the nearest $10,000. Net worth <Money value={netWorth} approx />
                        </>
                      )
                    }
                  />
                  <NumberField
                    label="Spend a year"
                    prefix="$"
                    money
                    allowBlank
                    placeholder="0"
                    value={annualSpend}
                    min={0}
                    max={1e9}
                    onValue={(v) => bind("annualSpend", setAnnualSpend)(v ?? 0)}
                    help={spendHelp(annualSpend, spendNow, (v) => bind("annualSpend", setAnnualSpend)(v))}
                  />
                  <NumberField
                    label="Health cover to 65"
                    prefix="$"
                    money
                    allowBlank
                    placeholder="0"
                    value={healthcareAnnual}
                    min={0}
                    max={1e7}
                    onValue={(v) => bind("healthcareAnnual", setHealthcareAnnual)(v ?? 0)}
                    help={
                      retireAge >= MEDICARE_AGE
                        ? "Not needed: Medicare starts by the time you retire."
                        : `A year, from retiring until Medicare at ${MEDICARE_AGE}. Families often pay $15,000 to $30,000.`
                    }
                  />
                  <NumberField
                    label="House, cash price"
                    prefix="$"
                    money
                    allowBlank
                    placeholder="None"
                    value={housePrice}
                    min={0}
                    max={1e10}
                    onValue={(v) => {
                      const next = v == null || v <= 0 ? null : v;
                      setHousePrice(next);
                      persist({ housePrice: next });
                    }}
                    help={houseAtRetire && housePrice != null ? houseHelp(housePrice, houseAge, retireAge, planAge, result.house) : "Leave blank for no house."}
                  />
                  {houseAtRetire || housePrice == null ? null : (
                    <NumberField
                      label="Buy the house at"
                      suffix="age"
                      integer
                      allowBlank
                      value={houseAgeSaved}
                      min={18}
                      max={120}
                      onValue={(v) => {
                        setHouseAge(v);
                        persist({ houseAge: v });
                      }}
                      help={houseHelp(housePrice, houseAge, retireAge, planAge, result.house)}
                    />
                  )}
                </div>
                {housePrice != null ? (
                  <label className="mt-3 flex min-h-9 w-fit cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      className="h-6 w-6 sm:h-4 sm:w-4"
                      checked={houseAtRetire}
                      onCheckedChange={(checked) => {
                        const next = checked === true;
                        setHouseAtRetire(next);
                        persist({ houseAtRetire: next });
                      }}
                    />
                    Buy the house the year I retire
                  </label>
                ) : null}
                <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3">
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                    <Checkbox className="h-6 w-6 sm:h-4 sm:w-4" checked={mode === "down"} onCheckedChange={(checked) => bind("spendMode", setMode)(checked === true ? "down" : "forever")} />
                    Spend it down instead of making it last for good
                  </label>
                  {mode === "down" ? (
                    <NumberField
                      className="w-40"
                      label="By age"
                      suffix="age"
                      integer
                      value={liveTo}
                      min={Math.min(120, retireAge + 1)}
                      max={120}
                      onValue={(v) => bind("liveTo", setLiveTo)(v ?? liveTo)}
                    />
                  ) : null}
                </div>
              </section>
            </div>

            <div className="planner-other min-w-0">
              <Assumptions
                summary={[
                  `${fmtRate(rate)} growth`,
                  `${fmtRate(returnShown)} after retiring`,
                  `${fmtRate(inflation)} inflation`,
                  `${fmtRate(taxPct)} tax`,
                  otherIncome > 0 ? `${formatMoney(otherIncome)} a year from ${otherIncomeAge}` : "no other income",
                ]}
              >
                <div className="field-grid field-grid-wide">
                  <NumberField
                    label="Growth"
                    suffix="%"
                    value={rate}
                    min={-50}
                    max={50}
                    onValue={(v) => bind("rate", setRate)(v ?? rate)}
                    help="Yearly return until you retire."
                  />
                  <NumberField
                    label="Return after retiring"
                    suffix="%"
                    allowBlank
                    placeholder={String(rate - 2)}
                    value={returnAfter}
                    min={-50}
                    max={50}
                    onValue={(v) => {
                      setReturnAfter(v);
                      persist({ returnAfter: v });
                    }}
                    help={returnAfter == null ? "Blank uses growth minus 2 points." : "Usually lower than growth."}
                  />
                  <NumberField
                    label="Inflation"
                    suffix="%"
                    value={inflation}
                    min={-10}
                    max={30}
                    onValue={(v) => bind("inflation", setInflation)(v ?? inflation)}
                  />
                  <NumberField
                    label="Tax on withdrawals"
                    suffix="%"
                    value={taxPct}
                    min={0}
                    max={90}
                    onValue={(v) => bind("taxPct", setTaxPct)(v ?? taxPct)}
                  />
                  <NumberField
                    label="Other income a year"
                    prefix="$"
                    money
                    allowBlank
                    placeholder="None"
                    value={otherIncome || null}
                    min={0}
                    max={1e9}
                    onValue={(v) => bind("otherIncome", setOtherIncome)(v ?? 0)}
                    help={
                      <>
                        Social Security or a pension. Estimate yours at{" "}
                        <a href="https://www.ssa.gov/myaccount/" target="_blank" rel="noreferrer" className="underline">
                          ssa.gov
                        </a>
                        .
                      </>
                    }
                  />
                  <NumberField
                    label="Income starts at"
                    suffix="age"
                    integer
                    value={otherIncomeAge}
                    min={18}
                    max={120}
                    onValue={(v) => bind("otherIncomeAge", setOtherIncomeAge)(v ?? otherIncomeAge)}
                  />
                </div>
              </Assumptions>
            </div>

            <div className="planner-kids min-w-0">
              <KidsSection
                kids={kids}
                currentYear={currentYear}
                childAnnual={childAnnual}
                collegeAnnual={collegeAnnual}
                childBalances={childBalances}
                added={result.error == null && !result.impossible ? result.kids : null}
                lastKidYear={lastKidYear}
                retireYear={retireYear}
                retireAge={retireAge}
                onChildAnnual={(v) => bind("childAnnual", setChildAnnual)(v)}
                onCollegeAnnual={(v) => bind("collegeAnnual", setCollegeAnnual)(v)}
                onKids={updateKids}
              />
            </div>
          </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function spendHelp(annualSpend: number, spendNow: number | null, use: (v: number) => void): ReactNode {
  if (spendNow == null || spendNow <= 0) return "Your yearly spending once retired, not counting kids or loans.";
  if (Math.abs(spendNow - annualSpend) <= 0.5) return "Starts at what you spend now, without loan payments. Change it to what you expect once retired.";
  return (
    <>
      Not counting kids or loans. You spend about{" "}
      <button type="button" className="cursor-pointer py-0.5 underline" onClick={() => use(spendNow)}>
        <Money value={spendNow} />
      </button>{" "}
      now without loan payments.
    </>
  );
}

function houseHelp(price: number | null, age: number | null, retireAge: number, ageNow: number, added: number): ReactNode {
  if (price == null) return undefined;
  if (age == null) return "Add an age to count the house.";
  if (age <= ageNow) return "That age has passed. Pick a later one.";
  if (age < retireAge) return "Before retiring, it comes out of savings, so you need to save more.";
  return (
    <>
      Adds <Money value={added} approx /> to your number.
    </>
  );
}

function Callout({ tone, children }: { tone: "good" | "warn" | "bad" | "info"; children: ReactNode }) {
  const Icon = tone === "good" ? CircleCheck : tone === "info" ? Info : CircleAlert;
  return (
    <div className="callout" data-tone={tone === "good" || tone === "bad" ? tone : undefined}>
      <Icon aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function RetireSlider({
  value,
  min,
  max,
  label,
  note,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  note: ReactNode;
  onChange: (v: number) => void;
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 100;
  return (
    <div className="min-w-0 flex-1 basis-80">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-lg font-medium">{label}</span>
        <span className="footnote">{note}</span>
      </div>
      <input
        type="range"
        className="range mt-2"
        aria-label="Retire at"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={max <= min}
        style={{ "--fill": `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="footnote flex justify-between">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

const CADENCE: Record<string, string> = {
  weekly: "every week",
  biweekly: "every 2 weeks",
  "semi-monthly": "twice a month",
  monthly: "every month",
  quarterly: "every quarter",
  annual: "every year",
};

/** "?" beside You save now: every number the estimate is built from. */
function SaveBreakdown({ saveNow }: { saveNow: SaveNow }) {
  const months = Math.max(1, Math.round(saveNow.yearFraction * 12));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="How this is worked out">
          <CircleHelp />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="kicker mb-3">How you save now is worked out</div>
        <dl className="prose-num space-y-3">
          <div>
            <div className="flex justify-between gap-3 font-medium">
              <dt>Regular take-home pay</dt>
              <dd>
                <Money value={saveNow.pay} />
              </dd>
            </div>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {saveNow.paySources.map((source, i) => (
                <li key={i} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{source.label}</span>
                    <span className="block">
                      <Money value={source.amount} /> {CADENCE[source.cadence] ?? source.cadence} × {source.perYear}
                    </span>
                  </span>
                  <Money value={source.amount * source.perYear} />
                </li>
              ))}
            </ul>
            <p className="footnote mt-1">Paychecks more than 20% off the usual amount, like bonuses, are left out.</p>
          </div>
          <div>
            <div className="flex justify-between gap-3 font-medium">
              <dt>− Spending</dt>
              <dd>
                <Money value={saveNow.spend} />
              </dd>
            </div>
            <p className="text-muted-foreground">
              <Money value={saveNow.spendPeriod} /> over the last {saveNow.basis} × {saveNow.factor}
              {saveNow.loans > 0.5 ? (
                <>
                  , with <Money value={saveNow.loans} /> of loan payments
                </>
              ) : null}
              .
            </p>
          </div>
          <div>
            <div className="flex justify-between gap-3 font-medium">
              <dt>+ Retirement contributions</dt>
              <dd>
                <Money value={saveNow.contributions} />
              </dd>
            </div>
            <p className="text-muted-foreground">
              {saveNow.contributionsYtd > 0.5 ? (
                <>
                  <Money value={saveNow.contributionsYtd} /> so far this year, over about {months} {months === 1 ? "month" : "months"}, scaled to 12. Paycheck
                  contributions come out before take-home pay, so they are added back.
                </>
              ) : (
                "No contributions found in your linked retirement accounts this year. If you contribute, enter your own yearly figure."
              )}
            </p>
          </div>
          <div className="flex justify-between gap-3 border-t border-border pt-2 font-medium">
            <dt>= You save now</dt>
            <dd>
              <Money value={saveNow.amount} />
            </dd>
          </div>
        </dl>
        <p className="footnote mt-3">If this looks off, type your own figure in the box under it.</p>
      </PopoverContent>
    </Popover>
  );
}

type Levers = {
  /** Retiring a year later, or a year earlier when the slider is already at its last age. */
  later: { age: number; needed: number | null } | null;
  spendLess: number | null;
  saveMoreAge: number | null;
  onRetire: (age: number) => void;
  onSpend: () => void;
  onSaveMore: () => void;
};

/**
 * The answer, the way an advisor would give it: a verdict first, the three figures behind it, then the levers that change it
 * and the checks a single straight-line forecast hides.
 */
function PlannerAnswer({
  result,
  number,
  needed,
  saveNow,
  saving,
  saveOverride,
  onSaveOverride,
  paceAge,
  affordable,
  mode,
  invested,
  annualSpend,
  retireAge,
  retireText,
  retireFor,
  latestRetire,
  liveTo,
  rate,
  inflation,
  levers,
  kidsChange,
}: {
  result: ReturnType<typeof retirementNumber>;
  number: number | null;
  needed: number | null;
  saveNow: SaveNow | null;
  saving: number | null;
  saveOverride: number | null;
  onSaveOverride: (v: number | null) => void;
  paceAge: number | null;
  affordable: number | null;
  mode: "forever" | "down";
  invested: number;
  annualSpend: number;
  retireAge: number;
  retireText: string;
  retireFor: (age: number) => string;
  latestRetire: number;
  liveTo: number;
  rate: number;
  inflation: number;
  levers: Levers;
  /** Kid costs before retiring differ from today's, so some years save more or less than Needed a year. */
  kidsChange: boolean;
}) {
  if (result.error != null) {
    return (
      <Callout tone="bad">
        Retire age ({retireAge}) has to come before the age you live to ({liveTo}). Raise Live to below.
      </Callout>
    );
  }
  if (result.impossible) {
    return <Callout tone="bad">{IMPOSSIBLE_MESSAGE}. Raise the return after retiring in Other assumptions, or choose Spend it down.</Callout>;
  }
  if (number == null || needed == null) {
    return annualSpend <= 0 ? (
      <Callout tone="info">Waiting on Spend a year below. Enter more than $0: what you expect to spend each year once retired.</Callout>
    ) : (
      <Callout tone="good">Your other income covers your spending, so you need nothing saved for retirement.</Callout>
    );
  }

  const share = Math.max(0, invested / number);
  const parts = [
    { label: "Living", value: result.living, color: LIVING },
    { label: "Kids and college", value: result.kids, color: KIDS },
    { label: `Health cover to ${MEDICARE_AGE}`, value: result.health, color: HEALTH },
    { label: "House", value: result.house, color: HOUSE },
  ].filter((part) => part.value > 0.005);
  const onTrack = saving != null && saving >= needed - 0.5;
  const saveScale = Math.max(1, needed, saving ?? 0);
  // The gap is taken between the figures as shown, so "ahead by" always matches the two amounts beside it.
  const gap = saving != null ? roundApprox(saving) - roundApprox(needed) : 0;

  const verdict =
    saving == null ? (
      <>
        To {retireText} spending <span className="num money">{formatWhole(annualSpend)}</span> a year, save about <Money value={needed} approx /> a year.
      </>
    ) : onTrack ? (
      <>
        You can {retireText} spending <span className="num money">{formatWhole(annualSpend)}</span> a year.
      </>
    ) : (
      <>
        You&apos;re about <Money value={-gap} approx /> a year short of being able to {retireText}.
      </>
    );
  const detail =
    saving == null ? (
      "Enter what you save a year below to see whether you're on track."
    ) : onTrack ? (
      <>
        What you save now is <Money value={gap} approx /> a year more than you need.
        {affordable != null && affordable > annualSpend + 500 ? (
          <>
            {" "}
            It would support spending about <Money value={affordable} approx /> a year
            {paceAge != null && paceAge < retireAge ? `, or you could ${retireFor(paceAge)}` : ""}.
          </>
        ) : paceAge != null && paceAge < retireAge ? (
          ` You could ${retireFor(paceAge)}.`
        ) : null}
      </>
    ) : (
      <>
        {paceAge == null
          ? `At what you save now you wouldn't get there before ${liveTo}.`
          : paceAge > latestRetire
            ? `At what you save now you could ${retireFor(paceAge)}, later than this planner goes.`
            : `At what you save now you could ${retireFor(paceAge)}.`}
        {affordable != null && affordable > 0 ? (
          <>
            {" "}
            Or keep your date and spend about <Money value={affordable} approx /> a year.
          </>
        ) : null}
      </>
    );

  return (
    <div className="space-y-6">
      <div className={`verdict ${saving == null ? "" : onTrack ? "verdict-good" : "verdict-warn"}`}>
        <p className="verdict-line prose-num">{verdict}</p>
        <p className="prose-num mt-1.5 text-sm text-muted-foreground">{detail}</p>
      </div>

      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="min-w-0">
          <div className="kicker">Retirement number</div>
          <div className="display-number hero-figure mt-1">
            <Money value={number} approx />
          </div>
          <p className="prose-num footnote mt-1">
            {mode === "forever" ? "Lets the money last for good" : `Lets you spend it down by ${liveTo}`}, in today&apos;s money, when you {retireText}.
          </p>
          <div
            className="meter mt-3"
            data-done={share >= 1 ? "" : undefined}
            role="progressbar"
            aria-valuenow={Math.min(100, Math.round(share * 100))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Of the way there"
          >
            <span style={{ width: `${Math.min(100, share * 100)}%` }} />
          </div>
          <div className="prose-num mt-1.5 flex flex-wrap justify-between gap-x-3 text-sm">
            <span className="text-muted-foreground">
              <Money value={invested} approx /> invested today
            </span>
            <span className={share >= 1 ? "font-medium text-positive" : "font-medium text-accent"}>
              {share >= 1 ? "Covered" : `${formatPct(share * 100, 0, false)} of the way`}
            </span>
          </div>
          {parts.length > 1 ? (
            <>
              <div className="stack-bar mt-3" aria-hidden>
                {parts.map((part) => (
                  <span key={part.label} style={{ width: `${(part.value / number) * 100}%`, "--swatch": part.color } as CSSProperties} />
                ))}
              </div>
              <ul className="mt-1.5">
                {parts.map((part) => (
                  <li key={part.label} className="legend-row text-sm" style={{ "--swatch": part.color } as CSSProperties}>
                    <span className="text-muted-foreground">{part.label}</span>
                    <Money value={part.value} approx />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className="min-w-0 lg:border-l lg:border-border lg:pl-10">
          <div className="kicker">Saving toward it, a year</div>
          <div className="save-compare mt-3">
            <div className="save-compare-row">
              <span className="text-muted-foreground">Needed</span>
              <span className="save-compare-track" aria-hidden>
                <span style={{ width: `${(needed / saveScale) * 100}%`, background: TARGET_LINE }} />
              </span>
              <span className="save-compare-value">
                <Money value={needed} approx />
              </span>
            </div>
            <div className="save-compare-row">
              <span className="flex items-center gap-1 text-muted-foreground">
                You save now
                {saveNow != null ? <SaveBreakdown saveNow={saveNow} /> : null}
              </span>
              <span className="save-compare-track" aria-hidden>
                {saving != null ? (
                  <span style={{ width: `${(Math.max(0, saving) / saveScale) * 100}%`, background: onTrack ? "var(--positive)" : "var(--accent)" }} />
                ) : null}
              </span>
              <span className={`save-compare-value ${saving == null ? "text-muted-foreground" : onTrack ? "text-positive" : "text-accent"}`}>
                {saving != null ? <Money value={saving} approx /> : "—"}
              </span>
            </div>
          </div>
          {saving != null ? (
            <p className={`prose-num mt-3 text-sm font-medium ${onTrack ? "text-positive" : "text-accent"}`}>
              {onTrack ? (
                <>
                  <Money value={gap} approx /> a year ahead
                </>
              ) : (
                <>
                  <Money value={-gap} approx /> a year short
                </>
              )}
              <span className="font-normal text-muted-foreground">
                {" "}
                · you need about <Money value={needed / 12} approx /> a month in all
              </span>
            </p>
          ) : (
            <p className="prose-num mt-3 text-sm text-muted-foreground">
              That&apos;s about <Money value={needed / 12} approx /> a month.
            </p>
          )}
          <NumberField
            className="mt-4 max-w-sm"
            label="Your own yearly saving"
            prefix="$"
            money
            allowBlank
            placeholder="e.g. 25,000"
            value={saveOverride}
            min={0}
            max={1e9}
            onValue={onSaveOverride}
            help={
              saveOverride != null ? (
                saveNow != null ? (
                  <>
                    Using your figure.{" "}
                    <button type="button" className="cursor-pointer py-0.5 underline" onClick={() => onSaveOverride(null)}>
                      Use the estimate, <Money value={saveNow.amount} approx />
                    </button>
                  </>
                ) : (
                  "Using your figure."
                )
              ) : saveNow != null ? (
                "Blank uses the estimate from your pay and spending (see ?)."
              ) : (
                "Haus can't see regular paychecks yet. Enter what you save in a year."
              )
            }
          />
          <p className="footnote mt-3">
            In today&apos;s money at {fmtRate(rate)} growth and {fmtRate(inflation)} inflation, so the dollar amount rises with prices.
            {kidsChange ? " In years a child is born or starts college, you'll save less than this; when one leaves home, more." : ""}
          </p>
        </div>
      </div>

      <div>
        <div className="kicker mb-2">What would change it</div>
        <div className="grid gap-3 md:grid-cols-3">
          {levers.later ? (
            <LeverButton
              title={levers.later.age > retireAge ? "Retire a year later" : "Retire a year earlier"}
              onClick={() => levers.onRetire(levers.later!.age)}
            >
              {levers.later.needed == null ? null : <SavingChange from={needed} to={levers.later.needed} />}
            </LeverButton>
          ) : null}
          {levers.spendLess != null ? (
            <LeverButton title="Spend $5,000 less a year" onClick={levers.onSpend}>
              <SavingChange from={needed} to={levers.spendLess} />
            </LeverButton>
          ) : null}
          {saving != null ? (
            <LeverButton title="Save $10,000 more a year" onClick={levers.onSaveMore}>
              {levers.saveMoreAge == null ? (
                "Still not enough before the end of the plan."
              ) : levers.saveMoreAge > latestRetire ? (
                <>Could {retireFor(levers.saveMoreAge)}, later than this planner goes.</>
              ) : paceAge != null && levers.saveMoreAge < paceAge ? (
                <>
                  Could {retireFor(levers.saveMoreAge)}, {paceAge - levers.saveMoreAge} {paceAge - levers.saveMoreAge === 1 ? "year" : "years"} sooner.
                </>
              ) : (
                <>Could {retireFor(levers.saveMoreAge)}.</>
              )}
            </LeverButton>
          ) : null}
        </div>
      </div>

    </div>
  );
}

type Tone = "good" | "warn";

/** A check the planner ran, as a short pill; the full explanation opens from it. */
function CheckPill({ tone, label, children }: { tone: Tone; label: ReactNode; children: ReactNode }) {
  const Icon = tone === "good" ? CircleCheck : CircleAlert;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="check-pill" data-tone={tone}>
          <Icon aria-hidden />
          <span className="prose-num">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="prose-num leading-relaxed">{children}</PopoverContent>
    </Popover>
  );
}

/** The checks a single straight-line forecast hides: weak markets, and the years before retirement accounts open. */
function PlanChecks({
  yours,
  mode,
  liveTo,
  weak,
  bridge,
  invested,
}: {
  yours: boolean;
  mode: "forever" | "down";
  liveTo: number;
  weak: { growth: number; runsOut: number | null; ageText: (age: number) => string };
  bridge: { cost: number; reachable: number; locked: number } | null;
  invested: number;
}) {
  const path = yours ? "your path" : "the target path";
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <CheckPill
        tone={weak.runsOut == null ? "good" : "warn"}
        label={
          <>
            Weak markets ({fmtRate(weak.growth)}): {weak.runsOut == null ? "still lasts" : `runs out ${weak.ageText(weak.runsOut)}`}
          </>
        }
      >
        {weak.runsOut == null ? (
          <>
            If growth and returns after retiring run 2 points lower ({fmtRate(weak.growth)} growth), {path} still {mode === "forever" ? "lasts for good" : `lasts to ${liveTo}`}.
            The shaded band on the chart runs from weak to strong markets.
          </>
        ) : (
          <>
            If growth and returns after retiring run 2 points lower ({fmtRate(weak.growth)} growth), {path} runs out {weak.ageText(weak.runsOut)}. The shaded band on the
            chart runs from weak to strong markets.
          </>
        )}
      </CheckPill>
      {bridge ? (
        <CheckPill
          tone={bridge.reachable >= bridge.cost ? "good" : "warn"}
          label={
            bridge.reachable >= bridge.cost ? (
              "Before 59½: covered"
            ) : (
              <>
                Before 59½: about <Money value={bridge.cost - bridge.reachable} approx /> short
              </>
            )
          }
        >
          Until 59½, spending has to come from money outside retirement accounts, or it pays an early-withdrawal penalty. Those years cost about{" "}
          <Money value={bridge.cost} approx />, and you&apos;d have about <Money value={bridge.reachable} approx /> outside them
          {invested > 0 ? ` (today, ${formatPct((1 - bridge.locked) * 100, 0, false)} of your investments are outside retirement accounts)` : ""}.
          {bridge.reachable >= bridge.cost ? "" : " Save more outside retirement accounts, or retire later."}
        </CheckPill>
      ) : null}
    </div>
  );
}

function LeverButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="lever" onClick={onClick}>
      <span className="font-medium text-foreground">{title}</span>
      <span className="prose-num text-sm text-muted-foreground">{children}</span>
    </button>
  );
}

function SavingChange({ from, to }: { from: number; to: number }) {
  // Worked out from the figures as shown, so the lever and Needed a year agree to the dollar.
  const change = roundApprox(to) - roundApprox(from);
  if (Math.abs(change) < 50) return <>About the same saving.</>;
  return change < 0 ? (
    <>
      Save <span className="font-medium text-positive">{formatApprox(-change)}</span> less a year.
    </>
  ) : (
    <>
      Save <span className="font-medium text-negative">{formatApprox(change)}</span> more a year.
    </>
  );
}

type ChartRow = {
  x: number;
  age: number;
  year: number;
  target: number;
  yours: number | null;
  /** The gap between your path and the target path: filled green where you're ahead, red where you're behind. */
  ahead: [number, number] | null;
  behind: [number, number] | null;
  range: [number, number] | null;
  /** Money in (+) or out (−) that year on your path. */
  flow: number;
  kidCost: number;
};

function PlannerChart({
  target,
  yours,
  weak,
  strong,
  needed,
  yourSaving,
  number,
  paceAge,
  paceNumber,
  endAge,
  liveTo,
  onToggle,
  retireAge,
  houseAge,
  incomeAge,
  medicare,
  kids,
  kidCost,
  childAnnual,
  collegeAnnual,
  byAge,
  todayMoney,
  inflation,
}: {
  target: PathPoint[];
  yours: PathPoint[] | null;
  weak: PathPoint[] | null;
  strong: PathPoint[] | null;
  needed: number;
  yourSaving: number | null;
  number: number | null;
  paceAge: number | null;
  /** The retirement number for retiring at the pace age, which is higher than the chosen age's. */
  paceNumber: number | null;
  /** Last age drawn: 80 when the money lasts forever, the live-to age when spending it down. */
  endAge: number;
  liveTo: number;
  onToggle: (v: boolean) => void;
  retireAge: number;
  houseAge: number | null;
  /** Age other income (Social Security, a pension) starts, when there is any. */
  incomeAge: number | null;
  /** Health cover stops at Medicare, when it is being paid for. */
  medicare: number | null;
  kids: { name: string; birthYear: number }[];
  kidCost: (year: number) => number;
  childAnnual: number;
  collegeAnnual: number;
  byAge: boolean;
  todayMoney: boolean;
  inflation: number;
}) {
  const start = target[0];
  const scale = useCallback((age: number) => (todayMoney ? 1 : (1 + inflation) ** (age - start.age)), [todayMoney, inflation, start.age]);
  const shown = useMemo(() => target.filter((point) => point.age <= endAge), [target, endAge]);
  const rows: ChartRow[] = useMemo(
    () =>
      shown.map((point, i) => {
        const k = scale(point.age);
        const t = Math.max(0, point.balance) * k;
        const y = yours ? Math.max(0, yours[i]?.balance ?? 0) * k : null;
        return {
          x: byAge ? point.age : point.year,
          age: point.age,
          year: point.year,
          target: t,
          yours: y,
          ahead: y == null ? null : [t, Math.max(t, y)],
          behind: y == null ? null : [Math.min(t, y), t],
          range: weak && strong ? [Math.max(0, weak[i]?.balance ?? 0) * k, Math.max(0, strong[i]?.balance ?? 0) * k] : null,
          flow: ((yours ?? target)[i]?.flow ?? 0) * k,
          kidCost: kidCost(point.year) * k,
        };
      }),
    [shown, target, yours, weak, strong, byAge, scale, kidCost],
  );
  const toX = (age: number) => (byAge ? age : start.year + (age - start.age));
  const yearToX = (year: number) => (byAge ? start.age + (year - start.year) : year);
  const when = (age: number) => (byAge ? `at ${age}` : `in ${start.year + (age - start.age)}`);

  // Ticks on round numbers: every 5 or 10 years of age (or calendar year), plus where the chart starts.
  const first = rows[0].x;
  const last = rows[rows.length - 1].x;
  const step = last - first > 50 ? 10 : 5;
  const xTicks = [first, ...Array.from({ length: Math.floor(last / step) - Math.floor(first / step) }, (_, i) => (Math.floor(first / step) + i + 1) * step)].filter(
    (t, i, all) => t <= last && (i === 0 || t - all[0] >= step / 2),
  );
  // The axis follows your path and the target path; the market band may run off the top rather than squash them.
  const yMax = Math.max(...rows.map((r) => Math.max(r.target, r.yours ?? 0)), number != null && todayMoney ? number : 0) * 1.15;
  const yTicks = niceTicks(yMax);
  const inRange = (age: number | null) => age != null && toX(age) > first && toX(age) <= last;

  // Each child: years at home, then college, on the same years as the chart. Only the parts inside the chart are drawn.
  const pct = (x: number) => ((Math.min(last, Math.max(first, x)) - first) / Math.max(1, last - first)) * 100;
  const kidRows = kids
    .map((kid) => ({
      ...kid,
      home: { from: yearToX(kid.birthYear), to: yearToX(kid.birthYear + 18) },
      college: { from: yearToX(kid.birthYear + 18), to: yearToX(kid.birthYear + 22) },
    }))
    .filter((kid) => kid.college.to > first && kid.home.from < last);

  const paceRow = paceAge != null ? rows.find((r) => r.age === paceAge) : null;
  const lastRow = rows[rows.length - 1];
  const runsOut = yours ? (yours.find((p) => p.age > retireAge && p.age < liveTo && p.balance <= 0)?.age ?? null) : null;
  const ahead = yours != null && rows.some((r) => r.yours != null && r.yours > r.target + 1);
  const behind = yours != null && rows.some((r) => r.yours != null && r.yours < r.target - 1);
  const grows = yours != null && (rows[rows.length - 1].yours ?? 0) > (rows.find((r) => r.age === retireAge)?.yours ?? 0) * 1.05;
  const houseAtRetire = houseAge != null && houseAge === retireAge;
  const events = [
    { age: retireAge, label: houseAtRetire ? "Retire + house" : "Retire", color: "#cbb892" },
    ...(inRange(houseAge) && !houseAtRetire ? [{ age: houseAge!, label: "House", color: HOUSE }] : []),
    ...(inRange(incomeAge) ? [{ age: incomeAge!, label: "Income starts", color: "#8fa0b8" }] : []),
    ...(inRange(medicare) && medicare !== retireAge ? [{ age: medicare!, label: "Medicare", color: HEALTH }] : []),
  ];

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="prose-num flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {yours && yourSaving != null ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-1 w-5 rounded" style={{ background: YOUR_LINE }} />
              <span>
                <span className="font-medium text-foreground">Your path</span>, saving <Money value={yourSaving} approx />
                /yr
              </span>
            </span>
          ) : null}
          <span className="flex items-center gap-2">
            <span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: TARGET_LINE }} />
            <span>
              <span className="font-medium text-foreground">Target path</span>, saving <Money value={needed} approx />
              /yr
            </span>
          </span>
          {ahead ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-5 rounded-sm" style={{ background: "color-mix(in srgb, var(--positive) 35%, transparent)" }} />
              <span>Ahead of target</span>
            </span>
          ) : null}
          {behind ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-5 rounded-sm" style={{ background: "color-mix(in srgb, var(--negative) 35%, transparent)" }} />
              <span>Behind target</span>
            </span>
          ) : null}

        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <span className="kicker">Today&apos;s money</span>
          <Switch aria-label="Today's money" checked={todayMoney} onCheckedChange={onToggle} />
        </label>
      </div>
      <div className="h-80 w-full sm:h-96">
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 28, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} ticks={xTicks} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis allowDataOverflow domain={[0, yTicks[yTicks.length - 1]]} ticks={yTicks} tick={{ ...AXIS, className: "money" }} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => compact(v)} />
            <Tooltip content={<ChartTip byAge={byAge} yourSaving={yourSaving} retireAge={retireAge} />} />
            {number != null && todayMoney ? (
              <ReferenceLine
                y={number}
                stroke="#8fa0b8"
                strokeDasharray="2 4"
                label={{ value: `Retirement number ${compact(number)}`, position: "insideTopLeft", fill: "#8fa0b8", fontSize: 11, className: "money" }}
              />
            ) : null}
            {events.map((event, i) => (
              <ReferenceLine
                key={event.label}
                x={toX(event.age)}
                stroke={event.color}
                strokeDasharray="4 4"
                label={{ value: event.label, position: "top", offset: 6 + (i % 2) * 12, fill: event.color, fontSize: 11 }}
              />
            ))}
            <Area type="linear" dataKey="range" stroke="none" fill={YOUR_LINE} fillOpacity={0.07} isAnimationActive={false} activeDot={false} />
            {yours ? (
              <>
                <Area type="linear" dataKey="ahead" stroke="none" fill="var(--positive)" fillOpacity={0.28} isAnimationActive={false} activeDot={false} />
                <Area type="linear" dataKey="behind" stroke="none" fill="var(--negative)" fillOpacity={0.28} isAnimationActive={false} activeDot={false} />
                <Line type="linear" dataKey="yours" stroke={YOUR_LINE} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </>
            ) : null}
            <Line type="linear" dataKey="target" stroke={TARGET_LINE} strokeWidth={yours ? 1.75 : 2.5} strokeDasharray={yours ? "6 4" : undefined} dot={false} isAnimationActive={false} />
            {lastRow.range ? (
              <ReferenceDot
                x={lastRow.x}
                y={Math.min(lastRow.range[0], yTicks[yTicks.length - 1])}
                r={0}
                label={{ value: "Weak markets", position: "insideBottomRight", offset: 4, fill: "#8fa0b8", fontSize: 11 }}
              />
            ) : null}
            {lastRow.range && lastRow.range[1] < yTicks[yTicks.length - 1] * 0.95 ? (
              <ReferenceDot
                x={lastRow.x}
                y={lastRow.range[1]}
                r={0}
                label={{ value: "Strong markets", position: "insideTopRight", offset: 4, fill: "#8fa0b8", fontSize: 11 }}
              />
            ) : null}
            {paceRow && paceRow.yours != null && paceAge !== retireAge ? (
              <ReferenceDot
                x={paceRow.x}
                y={paceRow.yours}
                r={4}
                fill={YOUR_LINE}
                stroke="none"
                label={{
                  value: `Could retire ${when(paceAge!)}${paceNumber != null ? ` (needs ${compact(paceNumber * scale(paceAge!))})` : ""}`,
                  position: "left",
                  offset: 8,
                  fill: YOUR_LINE,
                  fontSize: 11,
                  className: "money",
                }}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {kidRows.length > 0 ? (
        <ul className="kid-list" aria-label="Kid costs by year">
          {kidRows.map((kid, i) => (
            <li key={i} className="prose-num">
              <span className="text-foreground">{kid.name}</span>, born {kid.birthYear} · home to {kid.birthYear + 17} at <Money value={childAnnual} approx />
              /yr · college {kid.birthYear + 18}–{String(kid.birthYear + 21).slice(-2)} at <Money value={collegeAnnual} approx />
              /yr
            </li>
          ))}
        </ul>
      ) : null}
      {kidRows.length > 0 ? (
        <div className="kid-strip" aria-hidden>
          {kidRows.map((kid, i) => (
            <div key={i} className="kid-row">
              {kid.home.to > first ? (
                <span
                  className="kid-bar"
                  style={{ left: `${pct(kid.home.from)}%`, width: `${pct(kid.home.to) - pct(kid.home.from)}%` }}
                  title={`${kid.name}, born ${kid.birthYear}: ${formatApprox(childAnnual)} a year to 17`}
                >
                  {kid.name}, born {kid.birthYear} · <span className="money">{compact(childAnnual)}</span>/yr
                </span>
              ) : null}
              {kid.college.from < last ? (
                <span
                  className="kid-bar kid-bar-college"
                  style={{ left: `${pct(kid.college.from)}%`, width: `${pct(kid.college.to) - pct(kid.college.from)}%` }}
                  title={`${kid.name}: college ${kid.birthYear + 18} to ${kid.birthYear + 21}, ${formatApprox(collegeAnnual)} a year`}
                >
                  College
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <p className="footnote mt-2">
        {todayMoney ? "In today's money." : "In the dollars of each year."} Saving stops when you retire; after that, the balance pays your spending and
        keeps its investment returns.
        {grows ? " Your path keeps growing after retiring because its returns are more than you spend." : ""}
        {runsOut != null ? <span className="text-negative"> On your path, the money runs out {when(runsOut)}.</span> : null}
      </p>
    </div>
  );
}

function ChartTip({
  active,
  payload,
  byAge,
  yourSaving,
  retireAge,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  byAge: boolean;
  yourSaving: number | null;
  retireAge: number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const gap = row.yours != null ? row.yours - row.target : null;
  return (
    <div className="rounded-md border border-border bg-card-elevated px-3 py-2 text-xs">
      <div className="mb-1 text-muted-foreground">
        {row.year}
        {byAge ? `, age ${row.age}` : ""}
        {row.age > retireAge ? " · retired" : ""}
      </div>
      {row.yours != null && yourSaving != null ? (
        <div className="num">
          Your path: <span className="money">{formatApprox(row.yours)}</span>
        </div>
      ) : null}
      <div className="num">
        Target path: <span className="money">{formatApprox(row.target)}</span>
      </div>
      {gap != null && Math.abs(gap) > 1 ? (
        <div className={`num ${gap > 0 ? "text-positive" : "text-negative"}`}>
          {gap > 0 ? "Ahead by " : "Behind by "}
          <span className="money">{formatApprox(Math.abs(gap))}</span>
        </div>
      ) : null}
      <div className="num text-muted-foreground">
        {row.flow >= 0 ? "Saved that year: " : "Spent from savings: "}
        <span className="money">{formatApprox(Math.abs(row.flow))}</span>
      </div>
      {row.age <= retireAge && Math.abs(row.kidCost) > 0.5 ? (
        <div className="num text-muted-foreground">
          Kid costs above today&apos;s: <span className="money">{formatApprox(row.kidCost)}</span>
        </div>
      ) : null}
      {row.range ? (
        <div className="num text-muted-foreground">
          Weak to strong markets: <span className="money">{formatApprox(row.range[0])}</span> to <span className="money">{formatApprox(row.range[1])}</span>
        </div>
      ) : null}
    </div>
  );
}

function KidsSection({
  kids,
  currentYear,
  childAnnual,
  collegeAnnual,
  childBalances,
  added,
  lastKidYear,
  retireYear,
  retireAge,
  onChildAnnual,
  onCollegeAnnual,
  onKids,
}: {
  kids: PlanChildPref[];
  currentYear: number;
  childAnnual: number;
  collegeAnnual: number;
  childBalances: number;
  added: number | null;
  lastKidYear: number | null;
  retireYear: number;
  retireAge: number;
  onChildAnnual: (v: number) => void;
  onCollegeAnnual: (v: number) => void;
  onKids: (next: PlanChildPref[]) => void;
}) {
  const update = (id: string, patch: Partial<PlanChildPref>) => onKids(kids.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const counted = kids.some((kid) => kid.birthYear != null);
  return (
    <section className="form-section">
      <div className="kicker">Kids</div>
      <div className="field-grid field-grid-wide">
        <NumberField
          label="Each year, to 17"
          prefix="$"
          money
          value={childAnnual}
          min={0}
          max={1e8}
          onValue={(v) => onChildAnnual(v ?? 0)}
          help={counted ? "For each child." : "Counts once a child has a birth year."}
        />
        <NumberField
          label="College, 18 to 21"
          prefix="$"
          money
          value={collegeAnnual}
          min={0}
          max={1e8}
          onValue={(v) => onCollegeAnnual(v ?? 0)}
          help={
            childBalances > 0 ? (
              <>
                A year each. Child accounts cover <Money value={childBalances} />.
              </>
            ) : (
              "A year, for each child."
            )
          }
        />
      </div>
      {counted && added != null ? (
        <p className="prose-num mt-3 text-sm">
          {added > 0.005 ? (
            <>
              Kids add <Money value={added} approx className="font-medium" /> to your number.{" "}
              <span className="text-muted-foreground">Costs before you retire come from your paychecks.</span>
            </>
          ) : (
            <span className="text-muted-foreground">
              Kids add nothing here: their costs end in {lastKidYear}, before you retire in {retireYear} at {retireAge}. Your paychecks cover them.
            </span>
          )}
        </p>
      ) : null}

      {kids.length > 0 ? (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {kids.map((kid) => {
            const age = kid.birthYear == null ? null : currentYear - kid.birthYear;
            return (
              <li
                key={kid.id}
                className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(6rem,9rem)_2.25rem]"
              >
                {kid.planned ? (
                  <div className="field-box col-span-2 sm:col-span-1">
                    <input
                      data-live=""
                      aria-label="Child's name"
                      placeholder="Planned child"
                      className="!font-sans"
                      value={kid.name}
                      maxLength={80}
                      onChange={(e) => update(kid.id, { name: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <div className="truncate text-sm">{kid.name}</div>
                    <div className="footnote">{childNote(age)}</div>
                  </div>
                )}
                <NumberField
                  ariaLabel={`Birth year for ${kid.name || "planned child"}`}
                  integer
                  allowBlank
                  grouping={false}
                  prefix="Born"
                  placeholder="year"
                  value={kid.birthYear}
                  min={1900}
                  max={2200}
                  onValue={(v) => update(kid.id, { birthYear: v })}
                />
                {kid.planned ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${kid.name || "planned child"}`}
                    onClick={() => onKids(kids.filter((row) => row.id !== kid.id))}
                  >
                    <X />
                  </Button>
                ) : (
                  <span />
                )}
                {kid.planned ? <div className="footnote col-span-2 -mt-1 sm:col-span-3">{childNote(age, true)}</div> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => onKids([...kids, { id: `planned-${crypto.randomUUID()}`, name: "", birthYear: null, planned: true }])}
      >
        <Plus />
        Add a planned child
      </Button>
    </section>
  );
}

function childNote(age: number | null, planned = false) {
  if (age == null) return planned ? "Planned. Add a birth year to count this child." : "Add a birth year to count this child.";
  if (age < 0) return `Born in ${-age} ${-age === 1 ? "year" : "years"}.`;
  if (age > 21) return "Past college. Costs nothing here.";
  return `Age ${age} this year.`;
}

function Assumptions({ summary, children }: { summary: string[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="form-section">
      <button
        type="button"
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="kicker !text-accent">Other assumptions</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        {!open ? (
          <span className="w-full text-sm text-muted-foreground">
            {summary.map((item) => item.replaceAll(" ", " ")).join(" · ")}
          </span>
        ) : null}
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

