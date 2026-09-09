import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { merchantKey } from "@/lib/categories";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string(),
  userCategory: z.string().nullable().optional(),
  userMerchant: z.string().nullable().optional(),
  applyToMerchant: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const txn = await prisma.txn.update({
    where: { id: parsed.data.id },
    data: {
      userCategory: parsed.data.userCategory,
      userMerchant: parsed.data.userMerchant,
    },
  });
  if (parsed.data.applyToMerchant) {
    const keys = [
      ...new Set(
        [txn.merchantName, txn.name, txn.userMerchant, parsed.data.userMerchant]
          .map((x) => merchantKey(x))
          .filter(Boolean),
      ),
    ];
    for (const key of keys) {
      await prisma.merchantRule.upsert({
        where: { merchantKey: key },
        create: {
          merchantKey: key,
          category: parsed.data.userCategory ?? undefined,
          displayName: parsed.data.userMerchant ?? undefined,
        },
        update: {
          category: parsed.data.userCategory ?? undefined,
          displayName: parsed.data.userMerchant ?? undefined,
        },
      });
    }
    const all = await prisma.txn.findMany({
      select: { id: true, merchantName: true, userMerchant: true, name: true },
    });
    const ids = all
      .filter((row) =>
        [row.merchantName, row.userMerchant, row.name].some((x) => keys.includes(merchantKey(x))),
      )
      .map((row) => row.id);
    if (ids.length) {
      await prisma.txn.updateMany({
        where: { id: { in: ids } },
        data: {
          userCategory: parsed.data.userCategory ?? undefined,
          userMerchant: parsed.data.userMerchant ?? undefined,
        },
      });
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  await requireSession();
  const body = (await req.json().catch(() => ({}))) as { merchant?: string; rawMerchant?: string | null; name?: string };
  const keys = [...new Set([merchantKey(body.merchant), merchantKey(body.rawMerchant), merchantKey(body.name)].filter(Boolean))];
  if (!keys.length) return NextResponse.json({ error: "Merchant required." }, { status: 400 });
  for (const key of keys) {
    await prisma.merchantRule.upsert({
      where: { merchantKey: key },
      create: { merchantKey: key, hidden: true },
      update: { hidden: true },
    });
  }
  return NextResponse.json({ ok: true });
}
