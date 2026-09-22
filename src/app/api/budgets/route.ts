import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { deleteBudget, setBudget } from "@/lib/budgets";

export const dynamic = "force-dynamic";

const payload = z.object({
  category: z.string().trim().min(1).max(80),
  monthly: z.number().finite().min(0).max(1_000_000),
});

export async function POST(req: Request) {
  await requireSession();
  const parsed = payload.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid budget." }, { status: 400 });
  try {
    const row = await setBudget(parsed.data.category, parsed.data.monthly);
    return NextResponse.json({ ok: true, row });
  } catch {
    return NextResponse.json({ error: "Could not save the budget." }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  await requireSession();
  const parsed = payload.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid budget." }, { status: 400 });
  try {
    const row = await setBudget(parsed.data.category, parsed.data.monthly);
    return NextResponse.json({ ok: true, row });
  } catch {
    return NextResponse.json({ error: "Could not save the budget." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  await requireSession();
  const parsed = z.object({ category: z.string().trim().min(1).max(80) }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid budget." }, { status: 400 });
  await deleteBudget(parsed.data.category);
  return NextResponse.json({ ok: true });
}
