import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { setBudgetExcluded } from "@/lib/budget-excluded";

export const dynamic = "force-dynamic";

const schema = z.object({ id: z.string().min(1).max(200), excluded: z.boolean() });

/** Leave one charge out of budgets, or count it again. */
export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  await setBudgetExcluded(parsed.data.id, parsed.data.excluded);
  return NextResponse.json({ ok: true });
}
