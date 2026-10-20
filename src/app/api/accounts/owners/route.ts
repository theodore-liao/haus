import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { retargetSavedTxnOwner } from "@/lib/saved-txns";
import { readJson, updateOrGone } from "@/lib/api";

export const dynamic = "force-dynamic";

const schema = z.object({
  itemId: z.string(),
  owners: z.record(z.string(), z.string()),
});

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const { itemId, owners } = parsed.data;
  const values = Object.values(owners);
  const defaultOwner = values.includes("joint")
    ? "joint"
    : values[0] ?? "joint";
  const item = await updateOrGone(() => prisma.plaidItem.update({ where: { id: itemId }, data: { defaultOwner } }));
  if (item instanceof Response) return item;
  for (const [id, owner] of Object.entries(owners)) {
    // An account the bank dropped since the window opened is skipped; the rest still save.
    const { count } = await prisma.account.updateMany({ where: { id }, data: { owner } });
    if (count) await retargetSavedTxnOwner(id, owner);
  }
  return NextResponse.json({ ok: true });
}
