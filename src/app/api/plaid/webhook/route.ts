import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncPlaidItem } from "@/lib/plaid-sync";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    webhook_type?: string;
    webhook_code?: string;
    item_id?: string;
  };
  if (!body.item_id) return NextResponse.json({ ok: true });
  const item = await prisma.plaidItem.findUnique({ where: { itemId: body.item_id } });
  if (!item) return NextResponse.json({ ok: true });
  try {
    await syncPlaidItem(item.id);
  } catch {
    /* last good data remains */
  }
  return NextResponse.json({ ok: true });
}
