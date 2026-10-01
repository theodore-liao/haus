import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensurePriceHistory } from "@/lib/quotes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  symbol: z.string().min(1).max(20),
  kind: z.enum(["crypto", "equity"]),
  coingeckoId: z.string().max(120).nullable().optional(),
  spot: z.number().positive().nullable().optional(),
});

/** Fills up to five years of closes for one symbol, then returns the stored series for the chart. */
export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid price history request" }, { status: 400 });
  const symbol = parsed.data.symbol.toUpperCase();
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 5);
  await ensurePriceHistory(
    [
      {
        symbol,
        kind: parsed.data.kind,
        coingeckoId: parsed.data.coingeckoId ?? null,
        spot: parsed.data.spot ?? null,
      },
    ],
    from,
    to,
  ).catch(() => null);
  const prices = await prisma.pricePoint.findMany({
    where: { symbol },
    orderBy: { date: "asc" },
    select: { date: true, close: true },
  });
  return NextResponse.json({
    prices: prices.map((p) => ({ date: p.date.toISOString(), close: p.close })),
  });
}
