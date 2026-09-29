import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { merchantKey, recurringMerchantKey } from "@/lib/categories";
import { archiveTransactions } from "@/lib/saved-txns";

export const dynamic = "force-dynamic";

const schema = z.object({
  merchant: z.string().min(1),
  category: z.string().min(1).optional(),
  ignoreRecurring: z.literal(true).optional(),
});

/** Bring back every bill removed from Recurring. Rules that only held that flag go away; others keep their category or name. */
export async function DELETE() {
  await requireSession();
  const cleared = await prisma.merchantRule.updateMany({ where: { ignoreRecurring: true }, data: { ignoreRecurring: false } });
  await prisma.merchantRule.deleteMany({ where: { ignoreRecurring: false, hidden: false, category: null, displayName: null } });
  return NextResponse.json({ ok: true, restored: cleared.count });
}

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  if (parsed.data.ignoreRecurring) {
    const key = recurringMerchantKey(parsed.data.merchant);
    if (!key) return NextResponse.json({ error: "Merchant required." }, { status: 400 });
    await prisma.merchantRule.upsert({
      where: { merchantKey: key },
      create: { merchantKey: key, ignoreRecurring: true },
      update: { ignoreRecurring: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.category) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const key = merchantKey(parsed.data.merchant);
  if (!key) return NextResponse.json({ error: "Merchant required." }, { status: 400 });

  await prisma.merchantRule.upsert({
    where: { merchantKey: key },
    create: { merchantKey: key, category: parsed.data.category },
    update: { category: parsed.data.category },
  });

  const txns = await prisma.txn.findMany({
    select: { id: true, merchantName: true, userMerchant: true, name: true },
  });
  const ids = txns
    .filter((t) => merchantKey(t.userMerchant || t.merchantName || t.name) === key)
    .map((t) => t.id);
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 400) {
      const slice = ids.slice(i, i + 400);
      await prisma.txn.updateMany({
        where: { id: { in: slice } },
        data: { userCategory: parsed.data.category },
      });
    }
    await archiveTransactions({ id: ids });
  }
  return NextResponse.json({ ok: true, updated: ids.length });
}
