import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { syncAllItems, syncPlaidItem } from "@/lib/plaid-sync";
import { plaidConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireSession();
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { itemId?: string };
  try {
    if (body.itemId) {
      const result = await syncPlaidItem(body.itemId);
      return NextResponse.json({ ok: true, result });
    }
    const results = await syncAllItems();
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed." },
      { status: 500 },
    );
  }
}
