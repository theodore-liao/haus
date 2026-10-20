import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bodyId, readJson, updateOrGone } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireSession();
  const parsed = z.object({ name: z.string().trim().min(1).max(40) }).safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: "Name required." }, { status: 400 });
  const child = await prisma.child.create({ data: { name: parsed.data.name.trim() } });
  return NextResponse.json({ ok: true, child });
}

export async function PATCH(req: Request) {
  await requireSession();
  const parsed = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(40) }).safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const child = await updateOrGone(() =>
    prisma.child.update({
      where: { id: parsed.data.id },
      data: { name: parsed.data.name.trim() },
    }),
  );
  if (child instanceof Response) return child;
  return NextResponse.json({ ok: true, child });
}

export async function DELETE(req: Request) {
  await requireSession();
  const id = bodyId(await readJson(req));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // Already gone (removed on another device, or a second click) counts as done.
  await prisma.child.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
