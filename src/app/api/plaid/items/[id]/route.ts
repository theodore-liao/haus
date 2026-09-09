import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPlaidClient } from "@/lib/plaid";
import { snapshotNetWorth } from "@/lib/plaid-sync";
import { plaidAccessToken } from "@/lib/token-crypto";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await ctx.params;
  const item = await prisma.plaidItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    await getPlaidClient().itemRemove({ access_token: plaidAccessToken(item) });
  } catch {
    /* still remove locally */
  }
  await prisma.plaidItem.delete({ where: { id } });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true });
}
