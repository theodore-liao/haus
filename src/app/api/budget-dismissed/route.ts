import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { dismissBudget, undismissBudget } from "@/lib/budget-dismissed";

export const dynamic = "force-dynamic";

const schema = z.object({ id: z.string().trim().min(1).max(120) });

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "id required" }, { status: 400 });
  return NextResponse.json({ ids: await dismissBudget(parsed.data.id) });
}

export async function DELETE(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "id required" }, { status: 400 });
  return NextResponse.json({ ids: await undismissBudget(parsed.data.id) });
}
