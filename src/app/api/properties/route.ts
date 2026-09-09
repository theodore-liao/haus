import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { snapshotNetWorth } from "@/lib/plaid-sync";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  address: z.string().optional(),
  estimate: z.coerce.number(),
  asOfDate: z.string(),
  owner: z.string(),
  mortgageAccountId: z.string().nullable().optional(),
  mortgageBalance: z.coerce.number().nullable().optional(),
  rate: z.coerce.number().nullable().optional(),
  termMonths: z.coerce.number().nullable().optional(),
  piti: z.coerce.number().nullable().optional(),
  rent: z.coerce.number().nullable().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
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
    piti: d.piti,
    rent: d.rent,
    notes: d.notes,
  };
  const row = d.id
    ? await prisma.property.update({ where: { id: d.id }, data })
    : await prisma.property.create({ data });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: Request) {
  await requireSession();
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.property.delete({ where: { id } });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true });
}
