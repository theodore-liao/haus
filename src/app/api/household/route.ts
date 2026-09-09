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
    quoteApiKeySet: Boolean(household.quoteApiKey),
    children,
    options: ownerOptions({ ...household, children }),
  });
}

const patchSchema = z.object({
  nameA: z.string().min(1).max(40).optional(),
  nameB: z.string().min(1).max(40).optional(),
  quoteApiKey: z.string().nullable().optional(),
});

export async function PATCH(req: Request) {
  await requireSession();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  await ensureHousehold();
  const household = await prisma.household.update({
    where: { id: "haus" },
    data: parsed.data,
  });
  return NextResponse.json({ ok: true, household });
}
