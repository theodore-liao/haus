import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { ensureHousehold, prisma } from "@/lib/db";
import { ownerOptions } from "@/lib/owners";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireSession();
  const household = await ensureHousehold();
  const children = await prisma.child.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({
    nameA: household.nameA,
    nameB: household.nameB,
    birthdateA: household.birthdateA?.toISOString().slice(0, 10) ?? null,
    birthdateB: household.birthdateB?.toISOString().slice(0, 10) ?? null,
    quoteApiKeySet: Boolean(household.quoteApiKey),
    children,
    options: ownerOptions({ ...household, children }),
  });
}

// Birthdates arrive as "YYYY-MM-DD" (or null to clear) and are stored at UTC midnight.
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date")
  .nullable()
  .optional();

const patchSchema = z.object({
  nameA: z.string().min(1).max(40).optional(),
  nameB: z.string().min(1).max(40).optional(),
  birthdateA: isoDay,
  birthdateB: isoDay,
  quoteApiKey: z.string().nullable().optional(),
});

function toDate(s: string | null | undefined) {
  if (s === undefined) return undefined;
  return s === null ? null : new Date(`${s}T00:00:00Z`);
}

export async function PATCH(req: Request) {
  await requireSession();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  await ensureHousehold();
  const { birthdateA, birthdateB, ...rest } = parsed.data;
  const household = await prisma.household.update({
    where: { id: "haus" },
    data: { ...rest, birthdateA: toDate(birthdateA), birthdateB: toDate(birthdateB) },
  });
  return NextResponse.json({ ok: true, household });
}
