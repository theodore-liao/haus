import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  itemId: z.string(),
  owners: z.record(z.string(), z.string()),
});

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const { itemId, owners } = parsed.data;
  const values = Object.values(owners);
  const defaultOwner = values.includes("joint")
    ? "joint"
    : values[0] ?? "joint";
  await prisma.plaidItem.update({
    where: { id: itemId },
    data: { defaultOwner },
  });
  for (const [id, owner] of Object.entries(owners)) {
    await prisma.account.update({ where: { id }, data: { owner } });
  }
  return NextResponse.json({ ok: true });
}
