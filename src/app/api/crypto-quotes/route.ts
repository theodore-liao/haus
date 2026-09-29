import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { cachedCryptoDayMoves, cryptoDayMoves, ensurePriceHistory, refreshCryptoQuotes } from "@/lib/quotes";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({
  ids: z.array(z.string()).max(500).default([]),
  history: z.array(z.object({ symbol: z.string().max(20), coingeckoId: z.string().max(120).nullable(), spot: z.number().positive().nullable().optional() })).max(40).default([]),
});

/**
 * Refreshes stored crypto prices (at most every five minutes) and warms the 24h moves the Crypto page
 * reads from cache. `changed` tells the page whether a reload would show anything new.
 */
export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const ids = parsed.success ? parsed.data.ids : [];
  const history = parsed.success ? parsed.data.history : [];
  const before = cachedCryptoDayMoves(ids).size;
  const now = new Date();
  const from = new Date(now.getTime() - 45 * 86_400_000);
  const closesBefore = history.length ? await prisma.pricePoint.count({ where: { date: { gte: from } } }) : 0;
  const [updated] = await Promise.all([
    refreshCryptoQuotes().catch(() => 0),
    ids.length ? cryptoDayMoves(ids).catch(() => null) : null,
    // Backfill 45 days of closes for the summary line and the 1W and 1M moves; stored series are skipped, so this is quick after once.
    history.length ? ensurePriceHistory(history.map((h) => ({ ...h, kind: "crypto" as const })), from, now).catch(() => null) : null,
  ]);
  const closesAfter = history.length ? await prisma.pricePoint.count({ where: { date: { gte: from } } }) : 0;
  const after = cachedCryptoDayMoves(ids).size;
  return NextResponse.json({ changed: (updated ?? 0) > 0 || after > before || closesAfter > closesBefore });
}
