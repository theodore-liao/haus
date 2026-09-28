import { prisma } from "./db";

export type PlanChildPref = {
  id: string;
  name: string;
  birthYear: number | null;
  planned?: boolean;
};

export type MilestonePref = {
  amount: number | null;
  age: number | null;
};

export type ProjectionPrefs = {
  rate?: number;
  contribution?: number;
  retireAge?: number;
  yearsFallback?: number;
  holderKey?: "A" | "B";
  inflation?: number;
  becomesAmount?: number;
  becomesYears?: number;
  /** The household's own figure. Null follows cash and investments. */
  invested?: number | null;
  annualSpend?: number;
  liveTo?: number;
  spendMode?: "forever" | "down";
  childAnnual?: number;
  collegeAnnual?: number;
  planChildren?: PlanChildPref[];
  housePrice?: number | null;
  houseAge?: number | null;
  otherIncome?: number;
  otherIncomeAge?: number;
  taxPct?: number;
  /** Nominal percent after retiring. Null keeps the default, growth minus 2 points. */
  returnAfter?: number | null;
  milestones?: MilestonePref[];
  todayMoney?: boolean;
  /** The household's own yearly saving. Null uses the estimate from pay and spending. */
  saveOverride?: number | null;
  /** Yearly health cover from retiring until Medicare. */
  healthcareAnnual?: number;
  /** Buy the house the year of retiring (the default), rather than at `houseAge`. */
  houseAtRetire?: boolean;
};

async function ensureColumn() {
  const cols = await prisma.$queryRaw<{ name: string }[]>`PRAGMA table_info("Household")`;
  if (!cols.some((col) => col.name === "projectionPrefs")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Household" ADD COLUMN "projectionPrefs" TEXT`);
  }
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function numOrNull(v: unknown): number | null | undefined {
  if (v === null) return null;
  return num(v);
}

function parseChildren(v: unknown): PlanChildPref[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: PlanChildPref[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id) continue;
    const birth = numOrNull(row.birthYear);
    out.push({
      id: row.id.slice(0, 80),
      name: typeof row.name === "string" ? row.name.slice(0, 80) : "",
      birthYear: birth === undefined ? null : birth,
      planned: row.planned === true,
    });
  }
  return out.slice(0, 12);
}

function parseMilestones(v: unknown): MilestonePref[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: MilestonePref[] = [];
  for (const item of v.slice(0, 3)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const amount = numOrNull(row.amount);
    const age = numOrNull(row.age);
    out.push({
      amount: amount === undefined ? null : amount,
      age: age === undefined ? null : age,
    });
  }
  return out;
}

function parse(raw: string | null | undefined): ProjectionPrefs {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    const o = v as Record<string, unknown>;
    const out: ProjectionPrefs = {};
    const rate = num(o.rate);
    const contribution = num(o.contribution);
    const retireAge = num(o.retireAge);
    const yearsFallback = num(o.yearsFallback);
    const inflation = num(o.inflation);
    const becomesAmount = num(o.becomesAmount);
    const becomesYears = num(o.becomesYears);
    const invested = num(o.invested);
    const annualSpend = num(o.annualSpend);
    const liveTo = num(o.liveTo);
    const childAnnual = num(o.childAnnual);
    const collegeAnnual = num(o.collegeAnnual);
    const otherIncome = num(o.otherIncome);
    const otherIncomeAge = num(o.otherIncomeAge);
    const taxPct = num(o.taxPct);
    if (rate !== undefined) out.rate = rate;
    if (contribution !== undefined) out.contribution = contribution;
    if (retireAge !== undefined) out.retireAge = retireAge;
    if (yearsFallback !== undefined) out.yearsFallback = yearsFallback;
    if (o.holderKey === "A" || o.holderKey === "B") out.holderKey = o.holderKey;
    if (inflation !== undefined) out.inflation = inflation;
    if (becomesAmount !== undefined) out.becomesAmount = becomesAmount;
    if (becomesYears !== undefined) out.becomesYears = becomesYears;
    if (invested !== undefined) out.invested = invested;
    else if (o.invested === null) out.invested = null;
    if (annualSpend !== undefined) out.annualSpend = annualSpend;
    if (liveTo !== undefined) out.liveTo = liveTo;
    if (o.spendMode === "forever" || o.spendMode === "down") out.spendMode = o.spendMode;
    if (childAnnual !== undefined) out.childAnnual = childAnnual;
    if (collegeAnnual !== undefined) out.collegeAnnual = collegeAnnual;
    const children = parseChildren(o.planChildren);
    if (children) out.planChildren = children;
    if ("housePrice" in o) {
      const housePrice = numOrNull(o.housePrice);
      if (housePrice !== undefined) out.housePrice = housePrice;
    }
    if ("houseAge" in o) {
      const houseAge = numOrNull(o.houseAge);
      if (houseAge !== undefined) out.houseAge = houseAge;
    }
    if (otherIncome !== undefined) out.otherIncome = otherIncome;
    if (otherIncomeAge !== undefined) out.otherIncomeAge = otherIncomeAge;
    if (taxPct !== undefined) out.taxPct = taxPct;
    if ("returnAfter" in o) {
      const returnAfter = numOrNull(o.returnAfter);
      if (returnAfter !== undefined) out.returnAfter = returnAfter;
    }
    const milestones = parseMilestones(o.milestones);
    if (milestones) out.milestones = milestones;
    if (typeof o.todayMoney === "boolean") out.todayMoney = o.todayMoney;
    if (typeof o.houseAtRetire === "boolean") out.houseAtRetire = o.houseAtRetire;
    const healthcareAnnual = num(o.healthcareAnnual);
    if (healthcareAnnual !== undefined) out.healthcareAnnual = healthcareAnnual;
    if ("saveOverride" in o) {
      const saveOverride = numOrNull(o.saveOverride);
      if (saveOverride !== undefined) out.saveOverride = saveOverride;
    }
    return out;
  } catch {
    return {};
  }
}

export async function readProjectionPrefs(): Promise<ProjectionPrefs> {
  await ensureColumn();
  const rows = await prisma.$queryRaw<{ projectionPrefs: string | null }[]>`
    SELECT "projectionPrefs" FROM "Household" WHERE "id" = 'haus'
  `;
  return parse(rows[0]?.projectionPrefs);
}

/** Merge-patch into the stored JSON; other household columns are untouched. */
export async function writeProjectionPrefs(patch: ProjectionPrefs): Promise<ProjectionPrefs> {
  await ensureColumn();
  const current = await readProjectionPrefs();
  const next: ProjectionPrefs = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  }
  const json = JSON.stringify(next);
  await prisma.$executeRaw`
    UPDATE "Household" SET "projectionPrefs" = ${json} WHERE "id" = 'haus'
  `;
  return next;
}
