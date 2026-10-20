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
  year: z.number().nullable().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  vin: z.string().optional(),
  estimate: z.coerce.number(),
  asOfDate: calendarDay,
  owner: z.string(),
  loanAccountId: z.string().nullable().optional(),
  loanBalance: z.coerce.number().nullable().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const d = parsed.data;
  const data = {
    label: d.label,
    year: d.year,
    make: d.make,
    model: d.model,
    vin: d.vin?.trim() || null,
    estimate: d.estimate,
    asOfDate: new Date(d.asOfDate),
    owner: d.owner,
    loanAccountId: d.loanAccountId ?? null,
    loanBalance: d.loanBalance ?? null,
    notes: d.notes,
  };
  const id = d.id;
  const row = id
    ? await updateOrGone(() => prisma.vehicle.update({ where: { id }, data }))
    : await prisma.vehicle.create({ data });
  if (row instanceof Response) return row;
  await snapshotNetWorth();
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: Request) {
  await requireSession();
  const id = bodyId(await readJson(req));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // Already gone (removed on another device, or a second click) counts as done.
  await prisma.vehicle.deleteMany({ where: { id } });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true });
}
