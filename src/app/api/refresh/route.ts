import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { snapshotNetWorth, syncAllItems } from "@/lib/plaid-sync";
import { STALE_SYNC_HOURS } from "@/lib/constants";
import { plaidConfigured } from "@/lib/env";
import { enrichHoldingsQuotes, ensurePriceHistory } from "@/lib/quotes";
import { syncAllWallets } from "@/lib/crypto-wallets";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireSession();
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const items = await prisma.plaidItem.findMany();

  if (items.length === 0) {
    await enrichHoldingsQuotes();
    await syncAllWallets().catch(() => null);
    await snapshotNetWorth();
    return NextResponse.json({ ok: true, message: "Quotes refreshed." });
  }
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
  }
  const newest = items.reduce<Date | null>((acc, i) => {
    if (!i.lastSyncedAt) return acc;
    if (!acc || i.lastSyncedAt > acc) return i.lastSyncedAt;
    return acc;
  }, null);
  const stale = !newest || Date.now() - newest.getTime() > STALE_SYNC_HOURS * 3600 * 1000;
  if (!body.force && !stale) {
    await enrichHoldingsQuotes();
    return NextResponse.json({ skipped: true, message: "Already fresh." });
  }
  const results = await syncAllItems();
  await syncAllWallets().catch(() => null);
  const holdings = await prisma.holding.findMany({ select: { symbol: true, type: true, quotePrice: true } });
  const coins = await prisma.manualHolding.findMany({ select: { symbol: true, coingeckoId: true, quotePrice: true } });
  const walletAssets = await prisma.cryptoWalletAsset.findMany({
    select: { symbol: true, coingeckoId: true, quotePrice: true },
  });
  const from = new Date();
  from.setDate(from.getDate() - 730);
  await ensurePriceHistory(
    [
      ...holdings
        .filter((h) => h.symbol)
        .map((h) => ({
          symbol: h.symbol as string,
          spot: h.quotePrice,
          kind: (h.type === "cryptocurrency" ? "crypto" : "equity") as "crypto" | "equity",
        })),
      ...coins
        .filter((c) => c.coingeckoId !== "usd-fixed")
        .map((c) => ({
          symbol: c.symbol,
          coingeckoId: c.coingeckoId,
          spot: c.quotePrice,
          kind: (c.coingeckoId ? "crypto" : "equity") as "crypto" | "equity",
        })),
      ...walletAssets.map((c) => ({
        symbol: c.symbol,
        coingeckoId: c.coingeckoId,
        spot: c.quotePrice,
        kind: "crypto" as const,
      })),
    ],
    from,
    new Date(),
  ).catch(() => null);
  return NextResponse.json({ ok: true, message: "Household ledger refreshed.", results });
}
