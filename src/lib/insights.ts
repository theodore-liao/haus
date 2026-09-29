// A planner's checkup: each measure against a common rule of thumb, with what to do next.
// Pure, so it can be tested without a database. getInsights in queries.ts gathers the inputs.
import { formatMoney } from "./format";

/** The rules of thumb each measure is judged against. */
export const BENCHMARKS = {
  /** Months of essential spending kept in cash. */
  reserveMonths: 6,
  /** Share of take-home pay saved, in percent. */
  savingsRate: 20,
  /** Most of take-home pay for housing and loan payments, in percent. */
  housingShare: 36,
  /** Most of card limits in use, in percent. */
  cardUse: 30,
} as const;

export type InsightStatus = "act" | "watch" | "good" | "info";

export type Insight = {
  id: string;
  area: "Cash" | "Saving" | "Spending" | "Debt" | "Net worth" | "Investing" | "Retirement" | "College";
  title: string;
  /** The one figure. Dollar amounts inside it blur in privacy mode. */
  value: string;
  status: InsightStatus;
  /** Every meter uses one scale: the target sits two thirds along, so bars read alike. */
  meter?: { fill: number; target: number; label: string };
  /** One sentence: what to do next, or that it is fine. */
  next: string;
  /** The working, behind a "?". */
  math: string;
  /** Figures behind the value, shown on the card: dollar amounts a month, with the total rows marked. */
  breakdown?: { label: string; value: number; total?: boolean }[];
  href?: string;
  /** Rough yearly dollars at stake, to rank what to do first. */
  impact?: number;
};

export type Debt = { name: string; balance: number; rate: number | null; kind: "card" | "mortgage" | "loan" };

export type InsightInput = {
  cash: number;
  /** Must-pay spending a month: every loan payment plus rent and utilities, groceries, medical, and transport (90-day average). */
  monthlyEssential: number;
  /** Each must-pay category's share of monthlyEssential, a month. */
  essentialParts?: { category: string; monthly: number }[];
  /** Weighted interest rate on cash accounts that report one, in percent. */
  cashRate: number | null;
  /** Growth rate the planner uses, in percent. */
  growthRate: number;
  /** Trailing three complete months. */
  income3: number;
  /** Part of income3 that is RSU vests, counted at their 12-month average. */
  vests3?: number;
  /** Months of vest history that average covers. */
  vestMonths?: number;
  spend3: number;
  housing3: number;
  /** Take-home pay and spending, a year. */
  payAnnual: number;
  spendAnnual: number | null;
  cards: { used: number; limit: number; count: number };
  debts: Debt[];
  /** Bank fees and interest charges in the last 90 days. */
  fees90: number;
  netWorth: number;
  grossAssets: number;
  liabilities: number;
  /** Net worth a year ago (or the oldest on file), with its date. */
  netWorthThen: { value: number; date: string } | null;
  /** Saved from pay over the same stretch: income minus spending. */
  savedSince: number | null;
  /** Invested money: stocks, funds, and crypto in every account. */
  invested: number;
  crypto: number;
  /** Stocks, bonds, and cash inside investment accounts. */
  mix: { stocks: number; bonds: number; cash: number } | null;
  retirement: {
    number: number | null;
    needed: number | null;
    saving: number | null;
    retireAge: number;
    paceAge: number | null;
    ageKnown: boolean;
    retireYear: number;
  } | null;
  /** Retirement contributions so far this year, and the yearly room across accounts held. */
  contributions: { ytd: number; room: number; yearFraction: number } | null;
  /**
   * Child accounts against the college years still ahead. `planned` is true when the Retirement planner already takes
   * college out of each year's saving, so a 529 is a better home for money already counted, not extra saving.
   */
  college: { balances: number; cost: number; children: number; firstYear: number; monthsToFirst: number; planned: boolean } | null;
  /** Yearly growth after inflation, as a decimal: the planner's real return. */
  realGrowth: number;
};

const money = (n: number) => formatMoney(n);
const whole = (n: number) => formatMoney(Math.round(n)).replace(/\.00$/, "");
const pct = (ratio: number, digits = 0) => `${(ratio * 100).toFixed(digits)}%`;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Where the target sits on every meter. */
export const TARGET_AT = 2 / 3;
/** A value against its target (or limit), on the shared scale. */
function against(value: number, target: number, label: string) {
  return { fill: target > 0 ? clamp((value / target) * TARGET_AT) : 0, target: TARGET_AT, label };
}

export function buildInsights(x: InsightInput): Insight[] {
  const out: Insight[] = [];
  const t = BENCHMARKS;

  // --- Cash -------------------------------------------------------------------
  if (x.monthlyEssential > 0) {
    const months = x.cash / x.monthlyEssential;
    const reserve = x.monthlyEssential * t.reserveMonths;
    const short = reserve - x.cash;
    out.push({
      id: "reserve",
      area: "Cash",
      title: "Emergency fund",
      value: `${months.toFixed(1)} months`,
      status: short <= 0 ? "good" : months < t.reserveMonths / 2 ? "act" : "watch",
      meter: t.reserveMonths > 0 ? against(months, t.reserveMonths, `Target ${t.reserveMonths} months`) : undefined,
      next:
        short <= 0
          ? `Covers the usual ${t.reserveMonths}-month reserve.`
          : `Build ${whole(short)} more cash to reach ${t.reserveMonths} months.`,
      math: `${money(x.cash)} in cash accounts (checking and savings) ÷ ${money(x.monthlyEssential)} a month of must-pay spending = ${months.toFixed(1)} months. Must-pay spending is every loan payment plus rent and utilities, groceries, medical, and transport, averaged over the last 90 days: what would still be due if pay stopped. Target: ${t.reserveMonths} months.`,
      breakdown: [
        ...(x.essentialParts ?? []).map((p) => ({ label: p.category, value: p.monthly })),
        { label: "Must-pay a month", value: x.monthlyEssential, total: true },
        { label: "Cash on hand", value: x.cash, total: true },
      ],
      href: "/spending",
      impact: short > 0 ? short * 0.1 : undefined,
    });
    const idle = x.cash - reserve;
    if (idle > Math.max(1_000, reserve * 0.1)) {
      const gap = Math.max(0, x.growthRate - (x.cashRate ?? 0)) / 100;
      out.push({
        id: "idle-cash",
        area: "Cash",
        title: "Cash beyond your reserve",
        value: money(idle),
        status: "watch",
        next: `Investing it could earn about ${whole(idle * gap)} more a year.`,
        math: `${money(x.cash)} cash − ${money(reserve)} reserve (${t.reserveMonths} months of must-pay spending, loan payments included). Compares ${x.growthRate}% growth (the planner's rate) with ${x.cashRate != null ? `${x.cashRate.toFixed(2)}% on your cash` : "0% on cash that reports no rate"}.`,
        href: "/investments",
        impact: idle * gap,
      });
    }
  }

  // --- Saving -----------------------------------------------------------------
  const vestNote =
    (x.vests3 ?? 0) > 0
      ? ` Includes ${money(x.vests3 ?? 0)} of RSU vests: the last ${x.vestMonths ?? 12} months of vests averaged to a month, times 3, so one vest does not swing the result.`
      : "";
  if (x.income3 > 0) {
    const rate = (x.income3 - x.spend3) / x.income3;
    const goal = t.savingsRate / 100;
    const shortfall = (goal - rate) * x.income3 * 4;
    out.push({
      id: "savings-rate",
      area: "Saving",
      title: "Savings rate",
      value: pct(rate),
      status: rate >= goal ? "good" : rate < goal / 2 ? "act" : "watch",
      meter: goal > 0 ? against(Math.max(0, rate), goal, `Target ${t.savingsRate}%`) : undefined,
      next:
        rate >= goal
          ? `Above a ${t.savingsRate}% savings rate over the last three months.`
          : `Saving ${whole(shortfall / 12)} more a month would reach ${t.savingsRate}%.`,
      math: `(${money(x.income3)} income − ${money(x.spend3)} spending) ÷ ${money(x.income3)} income, over the last three complete months.${vestNote}`,
      href: "/spending",
      impact: shortfall > 0 ? shortfall : undefined,
    });
    if (x.housing3 > 0) {
      const share = x.housing3 / x.income3;
      const cap = t.housingShare / 100;
      out.push({
        id: "housing",
        area: "Spending",
        title: "Housing and loans",
        value: pct(share),
        status: share <= cap ? "good" : share > cap * 1.25 ? "act" : "watch",
        meter: against(share, cap, `Limit ${t.housingShare}%`),
        next:
          share <= cap
            ? `Within the usual ${t.housingShare}% of take-home pay.`
            : `Above the usual ${t.housingShare}% of take-home pay. Paying off a smaller loan frees up the most each month.`,
        math: `${money(x.housing3)} of rent, utilities, and loan payments ÷ ${money(x.income3)} take-home pay, over the last three complete months.${vestNote}`,
        href: "/spending",
      });
    }
  }

  // --- Retirement -------------------------------------------------------------
  const r = x.retirement;
  if (r && r.number != null && r.needed != null && r.saving != null) {
    const when = r.ageKnown ? `at ${r.retireAge}` : `in ${r.retireYear}`;
    const gap = r.needed - r.saving;
    out.push({
      id: "retirement",
      area: "Retirement",
      title: "Retirement plan",
      value: gap <= 0 ? "On track" : `${whole(gap)} a year short`,
      status: gap <= 0 ? "good" : gap > r.needed * 0.25 ? "act" : "watch",
      meter: r.needed > 0 ? against(Math.max(0, r.saving), r.needed, `Target ${whole(r.needed)} a year · you save ${whole(r.saving)}`) : undefined,
      next:
        gap <= 0
          ? r.paceAge != null && r.paceAge < r.retireAge && r.ageKnown
            ? `You could retire at ${r.paceAge}, earlier than the ${r.retireAge} you planned.`
            : `What you save now reaches your number ${when}.`
          : r.paceAge != null && r.ageKnown
            ? `Save ${whole(gap)} more a year to retire ${when}, or plan on ${r.paceAge}.`
            : `Save ${whole(gap)} more a year to retire ${when}.`,
      math: `You save about ${whole(r.saving)} a year; retiring ${when} needs ${whole(r.needed)} a year to reach a retirement number of ${whole(r.number)} in today's dollars. From the Retirement planner.`,
      href: "/retirement",
      impact: gap > 0 ? gap : undefined,
    });
  }
  // With nothing recorded this year there is no way to tell payroll contributions from none, so the card waits for one.
  if (x.contributions && x.contributions.room > 0 && x.contributions.ytd > 0) {
    const c = x.contributions;
    const pace = c.ytd / c.yearFraction;
    const unused = Math.max(0, c.room - pace);
    out.push({
      id: "contributions",
      area: "Retirement",
      title: "Retirement contributions this year",
      value: money(c.ytd),
      status: unused <= c.room * 0.1 ? "good" : "info",
      meter: against(c.ytd, c.room * c.yearFraction, `On pace by now: ${whole(c.room * c.yearFraction)}`),
      next:
        unused <= c.room * 0.1
          ? "On pace to use this year's room in your retirement accounts."
          : `At this pace about ${whole(unused)} of this year's tax-advantaged room goes unused.`,
      math: `${money(c.ytd)} contributed so far of ${money(c.room)} allowed this year across the retirement accounts you hold. The tick marks how much of the year has passed.`,
      href: "/retirement",
      impact: unused > 0 ? unused * 0.2 : undefined,
    });
  }
  if (x.college && x.college.cost > 0) {
    const c = x.college;
    const share = c.balances / c.cost;
    const left = Math.max(0, c.cost - c.balances);
    // Monthly saving that grows at the planner's real return to cover what is left, in today's dollars.
    const r = x.realGrowth / 12;
    const n = c.monthsToFirst;
    const perMonth = n <= 0 ? left : r > 0 ? (left * r) / ((1 + r) ** n - 1) : left / n;
    const covered = share >= 1;
    out.push({
      id: "college",
      area: "College",
      title: "College saved",
      value: pct(Math.min(share, 9.99)),
      status: covered ? "good" : c.planned ? "info" : share < 0.25 ? "act" : "watch",
      meter: against(share, 1, `Target ${whole(c.cost)} by ${c.firstYear}`),
      next: covered
        ? "Child accounts cover the college the planner expects."
        : c.planned
          ? `Your retirement plan already pays for college from saving. Putting about ${whole(perMonth)} a month of that saving in a 529 would grow tax-free.`
          : n > 0
            ? `Saving ${whole(perMonth)} a month in a 529 covers it by ${c.firstYear}.`
            : `College has started; ${whole(left)} of its cost is not covered by child accounts.`,
      math: `${money(c.balances)} in child accounts ÷ ${money(c.cost)}: each child's college years still ahead at the planner's yearly college cost, in today's dollars. The monthly figure grows at the planner's return after inflation (${(x.realGrowth * 100).toFixed(1)}%).`,
      href: "/retirement",
      impact: covered || c.planned ? undefined : perMonth * 12 * 0.5,
    });
  }

  // --- Debt -------------------------------------------------------------------
  const priced = x.debts.filter((d) => d.balance > 0 && d.rate != null).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  const top = priced[0];
  if (top) {
    const costly = top.rate! >= 8;
    const cost = (top.balance * top.rate!) / 100;
    out.push({
      id: "debt-rate",
      area: "Debt",
      title: "Most expensive debt",
      value: `${top.rate!.toFixed(2)}%`,
      status: costly ? "act" : top.rate! >= 6 && top.kind !== "mortgage" ? "watch" : "good",
      next: costly
        ? `Pay down ${top.name} first; its ${money(top.balance)} costs about ${whole(cost)} a year in interest.`
        : `${top.name} is your highest rate. Nothing is costly enough to rush.`,
      math: priced.map((d) => `${d.name}: ${money(d.balance)} at ${d.rate!.toFixed(2)}%`).join(" · "),
      href: top.kind === "card" ? "/transactions" : top.kind === "mortgage" ? "/property" : "/connections",
      impact: costly ? cost : undefined,
    });
  }
  if (x.cards.limit > 0) {
    const use = x.cards.used / x.cards.limit;
    const cap = t.cardUse / 100;
    out.push({
      id: "card-use",
      area: "Debt",
      title: "Card use",
      value: pct(use),
      status: use <= cap ? "good" : use > cap * 1.5 ? "act" : "watch",
      meter: against(use, cap, `Limit ${t.cardUse}%`),
      next:
        use <= cap
          ? `Under ${t.cardUse}%, which helps your credit score.`
          : `Pay cards down by ${whole(x.cards.used - cap * x.cards.limit)} to get under ${t.cardUse}%.`,
      math: `${money(x.cards.used)} in balances ÷ ${money(x.cards.limit)} in limits across ${x.cards.count} card${x.cards.count === 1 ? "" : "s"}.`,
      href: "/transactions",
    });
  }
  if (x.fees90 >= 1) {
    const yearly = x.fees90 * 4;
    out.push({
      id: "fees",
      area: "Debt",
      title: "Fees and interest charges",
      value: `${money(x.fees90)} in 90 days`,
      status: yearly >= 200 ? "watch" : "info",
      next:
        yearly >= 200
          ? `About ${whole(yearly)} a year. Find which accounts charge them; many banks waive fees on request.`
          : `About ${whole(yearly)} a year. Small, but many banks waive fees on request.`,
      math: "Bank fees and card interest charges in the last 90 days, times four for a year.",
      href: "/transactions",
      impact: yearly >= 200 ? yearly : undefined,
    });
  }
  if (x.grossAssets > 0) {
    const ratio = x.liabilities / x.grossAssets;
    out.push({
      id: "debt-assets",
      area: "Debt",
      title: "Debt to assets",
      value: pct(ratio),
      status: ratio > 0.8 ? "watch" : "info",
      next:
        ratio > 0.8
          ? "Most of what you own is borrowed against. Paying debt down builds equity fastest."
          : `You own ${pct(1 - ratio)} of your assets outright. Each loan payment raises the share you own.`,
      math: `${money(x.liabilities)} owed ÷ ${money(x.grossAssets)} in assets.`,
      href: "/property",
    });
  }

  // --- Investing --------------------------------------------------------------
  if (x.netWorthThen) {
    const change = x.netWorth - x.netWorthThen.value;
    const markets = x.savedSince != null ? change - x.savedSince : null;
    out.push({
      id: "net-worth",
      area: "Net worth",
      title: `Net worth since ${x.netWorthThen.date}`,
      value: `${change >= 0 ? "+" : "−"}${money(Math.abs(change))}`,
      status: change >= 0 ? "good" : "watch",
      next:
        markets != null && x.savedSince != null
          ? `About ${whole(x.savedSince)} came from saving and ${markets >= 0 ? "" : "−"}${whole(Math.abs(markets))} from markets and values.`
          : x.netWorthThen.value > 0
            ? change >= 0
              ? `Up ${pct(Math.abs(change) / x.netWorthThen.value, 1)}. Keep saving at this pace and it keeps compounding.`
              : `Down ${pct(Math.abs(change) / x.netWorthThen.value, 1)}. The Overview chart shows when it fell.`
            : `${change >= 0 ? "Up" : "Down"} over this stretch.`,
      math: `${money(x.netWorth)} today vs ${money(x.netWorthThen.value)} on ${x.netWorthThen.date}.${x.savedSince != null ? ` Saving is income minus spending over the same months; the rest is markets, home and car values, and anything not in transactions.` : ""}`,
      href: "/",
    });
  }
  if (x.mix) {
    const total = x.mix.stocks + x.mix.bonds + x.mix.cash;
    if (total > 0) {
      out.push({
        id: "mix",
        area: "Investing",
        title: "Stocks in your investments",
        value: pct(x.mix.stocks / total),
        status: "info",
        next: `${pct(x.mix.bonds / total)} bonds and ${pct(x.mix.cash / total)} cash.`,
        math: `${money(x.mix.stocks)} stocks, ${money(x.mix.bonds)} bonds, and ${money(x.mix.cash)} cash in investment accounts. Funds count by their name: bond and treasury funds are bonds.`,
        href: "/investments",
      });
    }
  }
  if (x.invested > 0 && x.crypto > 0) {
    const share = x.crypto / x.invested;
    out.push({
      id: "crypto",
      area: "Investing",
      title: "Crypto share",
      value: pct(share, share < 0.1 ? 1 : 0),
      status: "info",
      next: share > 0.2 ? "More than a fifth of your investments, so expect large swings." : "A small share of your investments.",
      math: `${money(x.crypto)} in crypto ÷ ${money(x.invested)} invested.`,
      href: "/crypto",
    });
  }

  return out;
}

const ORDER: Record<InsightStatus, number> = { act: 0, watch: 1, good: 2, info: 3 };

/** Problems first, biggest money first within each. */
export function rankInsights(list: Insight[]) {
  return [...list].sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.impact ?? 0) - (a.impact ?? 0));
}

/** The few next steps worth doing first. */
export function topActions(list: Insight[], count = 3) {
  return rankInsights(list)
    .filter((i) => i.status === "act" || i.status === "watch")
    .slice(0, count);
}
