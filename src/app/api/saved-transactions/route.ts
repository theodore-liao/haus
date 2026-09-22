import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clearTransactionsStoredSince, deleteAllSavedTransactions, listSavedTransactions } from "@/lib/saved-txns";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireSession();
  const rows = await listSavedTransactions();
  return NextResponse.json({ rows });
}

const wipe = z.object({ confirm: z.literal(true) });

export async function DELETE(req: Request) {
  await requireSession();
  const parsed = wipe.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirmation required." }, { status: 400 });
  await deleteAllSavedTransactions();
  await prisma.household.update({ where: { id: "haus" }, data: { keepTransactions: false } });
  await clearTransactionsStoredSince();
  return NextResponse.json({ ok: true });
}
