import { prisma } from "./db";

export type ProjectionPrefs = {
  rate?: number;
  contribution?: number;
  retireAge?: number;
  yearsFallback?: number;
  holderKey?: "A" | "B";
};

async function ensureColumn() {
  const cols = await prisma.$queryRaw<{ name: string }[]>`PRAGMA table_info("Household")`;
  if (!cols.some((col) => col.name === "projectionPrefs")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Household" ADD COLUMN "projectionPrefs" TEXT`);
  }
}

function parse(raw: string | null | undefined): ProjectionPrefs {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    const o = v as Record<string, unknown>;
    const out: ProjectionPrefs = {};
    if (typeof o.rate === "number" && Number.isFinite(o.rate)) out.rate = o.rate;
    if (typeof o.contribution === "number" && Number.isFinite(o.contribution)) out.contribution = o.contribution;
    if (typeof o.retireAge === "number" && Number.isFinite(o.retireAge)) out.retireAge = o.retireAge;
    if (typeof o.yearsFallback === "number" && Number.isFinite(o.yearsFallback)) out.yearsFallback = o.yearsFallback;
    if (o.holderKey === "A" || o.holderKey === "B") out.holderKey = o.holderKey;
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
  if (patch.rate !== undefined) next.rate = patch.rate;
  if (patch.contribution !== undefined) next.contribution = patch.contribution;
  if (patch.retireAge !== undefined) next.retireAge = patch.retireAge;
  if (patch.yearsFallback !== undefined) next.yearsFallback = patch.yearsFallback;
  if (patch.holderKey !== undefined) next.holderKey = patch.holderKey;
  const json = JSON.stringify(next);
  await prisma.$executeRaw`
    UPDATE "Household" SET "projectionPrefs" = ${json} WHERE "id" = 'haus'
  `;
  return next;
}
