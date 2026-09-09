import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isRetirementType } from "@/lib/account-types";

export const dynamic = "force-dynamic";

const schema = z.object({
  owner: z.string().optional(),
  isRetirement: z.boolean().optional(),
  retirementKind: z.string().nullable().optional(),
  hausType: z.string().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const d = parsed.data;
  const row = await prisma.account.update({
    where: { id },
    data: {
      owner: d.owner,
      isRetirement: d.isRetirement ?? (d.retirementKind ? true : undefined),
      retirementKind: d.retirementKind,
      hausType: d.hausType,
    },
  });
  if (d.hausType && isRetirementType(d.hausType) && d.isRetirement === undefined) {
    await prisma.account.update({
      where: { id },
      data: { isRetirement: true, retirementKind: d.hausType },
    });
  }
  return NextResponse.json({ ok: true, row });
}
