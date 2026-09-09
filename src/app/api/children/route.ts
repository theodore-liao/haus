import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireSession();
  const parsed = z.object({ name: z.string().min(1).max(40) }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Name required." }, { status: 400 });
  const child = await prisma.child.create({ data: { name: parsed.data.name } });
  return NextResponse.json({ ok: true, child });
}

export async function DELETE(req: Request) {
  await requireSession();
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.child.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
