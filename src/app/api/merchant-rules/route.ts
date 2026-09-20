import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { merchantKey, recurringMerchantKey } from "@/lib/categories";

export const dynamic = "force-dynamic";

const schema = z.object({
  merchant: z.string().min(1),
  category: z.string().min(1).optional(),
  ignoreRecurring: z.literal(true).optional(),
});

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
    await prisma.txn.updateMany({
      where: { id: { in: ids } },
      data: { userCategory: parsed.data.category },
    });
  }
  return NextResponse.json({ ok: true, updated: ids.length });
}
