import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { snapshotNetWorth } from "@/lib/plaid-sync";
import { bodyId, calendarDay, readJson, updateOrGone } from "@/lib/api";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().optional(),
  // Child accounts, and retirement accounts the household can't link.
  hausType: z.enum(["529", "custodial", "trump", "hsa", "401k", "403b", "ira", "roth"]),
  name: z.string().trim().min(1).max(80),
  owner: z.string(),
  beneficiary: z.string().optional(),
  balance: z.number().finite(),
  asOfDate: calendarDay,
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await readJson(req));
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
  const id = d.id;
  const row = id
    ? await updateOrGone(() => prisma.manualAccount.update({ where: { id }, data }))
    : await prisma.manualAccount.create({ data });
  if (row instanceof Response) return row;
  await snapshotNetWorth();
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: Request) {
  await requireSession();
  const id = bodyId(await readJson(req));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // Already gone (removed on another device, or a second click) counts as done.
  await prisma.manualAccount.deleteMany({ where: { id } });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true });
}
