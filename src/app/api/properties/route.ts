import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { snapshotNetWorth } from "@/lib/plaid-sync";
import { bodyId, calendarDay, readJson, updateOrGone } from "@/lib/api";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  address: z.string().optional(),
  estimate: z.coerce.number(),
  asOfDate: calendarDay,
  owner: z.string(),
  mortgageAccountId: z.string().nullable().optional(),
  mortgageBalance: z.coerce.number().nullable().optional(),
  rate: z.coerce.number().nullable().optional(),
  termMonths: z.coerce.number().nullable().optional(),
  originalTermMonths: z.coerce.number().nullable().optional(),
  originationDate: calendarDay.nullable().optional(),
  extraPrincipal: z.coerce.number().nullable().optional(),
  taxAnnual: z.coerce.number().nullable().optional(),
  insuranceAnnual: z.coerce.number().nullable().optional(),
  escrowMonthly: z.coerce.number().nullable().optional(),
  pmiMonthly: z.coerce.number().nullable().optional(),
  piti: z.coerce.number().nullable().optional(),
  rent: z.coerce.number().nullable().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const d = parsed.data;
  const data = {
    label: d.label,
    address: d.address,
    estimate: d.estimate,
    asOfDate: new Date(d.asOfDate),
    owner: d.owner,
    mortgageAccountId: d.mortgageAccountId ?? null,
    mortgageBalance: d.mortgageBalance ?? null,
    rate: d.rate,
    termMonths: d.termMonths,
    originalTermMonths: d.originalTermMonths ?? null,
    originationDate: d.originationDate ? new Date(d.originationDate) : null,
    extraPrincipal: d.extraPrincipal ?? null,
    taxAnnual: d.taxAnnual ?? null,
    insuranceAnnual: d.insuranceAnnual ?? null,
    escrowMonthly: d.escrowMonthly ?? null,
    pmiMonthly: d.pmiMonthly ?? null,
    piti: d.piti,
    rent: d.rent,
    notes: d.notes,
  };
  const id = d.id;
  const row = id
    ? await updateOrGone(() => prisma.property.update({ where: { id }, data }))
    : await prisma.property.create({ data });
  if (row instanceof Response) return row;
  await snapshotNetWorth();
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: Request) {
  await requireSession();
  const id = bodyId(await readJson(req));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // Already gone (removed on another device, or a second click) counts as done.
  await prisma.property.deleteMany({ where: { id } });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  id: z.string().min(1),
  extraPrincipal: z.number().finite().min(0).max(1_000_000).nullable(),
});

/** The extra-payment what-if on Property saves on its own, without resending the whole home. */
export async function PATCH(req: Request) {
  await requireSession();
  const parsed = patchSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const row = await updateOrGone(() =>
    prisma.property.update({
      where: { id: parsed.data.id },
      data: { extraPrincipal: parsed.data.extraPrincipal },
    }),
  );
  if (row instanceof Response) return row;
  return NextResponse.json({ ok: true, row });
}
