import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { snapshotNetWorth } from "@/lib/plaid-sync";
import { resolveCrypto } from "@/lib/crypto-assets";
import { enrichCryptoQuotes } from "@/lib/quotes";
import { fetchSpotUsd } from "@/lib/token-prices";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().optional(),
  symbol: z.string().min(1),
  quantity: z.coerce.number().positive(),
  costBasis: z.number().nullable().optional(),
  owner: z.string(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const d = parsed.data;
  const resolved = await resolveCrypto(d.symbol);
  if (!resolved) {
    return NextResponse.json({ error: "Unknown cryptocurrency. Try BTC, ETH, or a CoinGecko id." }, { status: 400 });
  }
  const spot = await fetchSpotUsd(resolved.symbol, resolved.id).catch(() => null);
  const data = {
    kind: "crypto",
    symbol: resolved.symbol,
    coingeckoId: resolved.id,
    name: resolved.name,
    quantity: d.quantity,
    costBasis: d.costBasis ?? undefined,
    owner: d.owner,
    notes: d.notes,
    quotePrice: spot?.price ?? undefined,
    quoteChange: spot ? spot.price * ((spot.changePct ?? 0) / 100) : undefined,
    quoteChangePct: spot?.changePct ?? undefined,
    quoteAsOf: spot ? new Date() : undefined,
  };
  const row = d.id
    ? await prisma.manualHolding.update({ where: { id: d.id }, data })
    : await prisma.manualHolding.create({ data });
  await enrichCryptoQuotes().catch(() => null);
  await snapshotNetWorth();
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: Request) {
  await requireSession();
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.manualHolding.delete({ where: { id } });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true });
}
