import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { cachedCryptoDayMoves, cryptoDayMoves, refreshCryptoQuotes } from "@/lib/quotes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({ ids: z.array(z.string()).max(500).default([]) });

/**
 * Refreshes stored crypto prices (at most every five minutes) and warms the 24h moves the Crypto page
 * reads from cache. `changed` tells the page whether a reload would show anything new.
 */
export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const ids = parsed.success ? parsed.data.ids : [];
  const before = cachedCryptoDayMoves(ids).size;
  const [updated] = await Promise.all([refreshCryptoQuotes().catch(() => 0), ids.length ? cryptoDayMoves(ids).catch(() => null) : null]);
  const after = cachedCryptoDayMoves(ids).size;
  return NextResponse.json({ changed: (updated ?? 0) > 0 || after > before });
}
