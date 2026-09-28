import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { setCryptoCost } from "@/lib/crypto-cost";

export const dynamic = "force-dynamic";

const schema = z.object({
  costs: z
    .array(z.object({ symbol: z.string().min(1).max(40), avgCost: z.number().nonnegative().finite().nullable() }))
    .max(500),
});

/** Saves average cost per coin. A null or zero cost clears it. */
export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid costs." }, { status: 400 });
  for (const c of parsed.data.costs) await setCryptoCost(c.symbol, c.avgCost);
  return NextResponse.json({ ok: true });
}
