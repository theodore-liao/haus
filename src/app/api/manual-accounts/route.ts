import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { snapshotNetWorth } from "@/lib/plaid-sync";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().optional(),
  hausType: z.enum(["529", "custodial", "trump", "hsa"]),
  name: z.string().min(1),
  owner: z.string(),
  beneficiary: z.string().optional(),
  balance: z.number(),
  asOfDate: z.string(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const d = parsed.data;
  const data = {
    hausType: d.hausType,
    name: d.name,
    owner: d.owner,
    beneficiary: d.beneficiary,
    balance: d.balance,
    asOfDate: new Date(d.asOfDate),
    notes: d.notes,
  };
  const row = d.id
    ? await prisma.manualAccount.update({ where: { id: d.id }, data })
    : await prisma.manualAccount.create({ data });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: Request) {
  await requireSession();
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.manualAccount.delete({ where: { id } });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true });
}
