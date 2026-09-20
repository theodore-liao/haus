import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { snapshotNetWorth } from "@/lib/plaid-sync";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  year: z.number().nullable().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  vin: z.string().optional(),
  estimate: z.coerce.number(),
  asOfDate: z.string(),
  owner: z.string(),
  loanAccountId: z.string().nullable().optional(),
  loanBalance: z.coerce.number().nullable().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
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
  const row = d.id
    ? await prisma.vehicle.update({ where: { id: d.id }, data })
    : await prisma.vehicle.create({ data });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: Request) {
  await requireSession();
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.vehicle.delete({ where: { id } });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true });
}
