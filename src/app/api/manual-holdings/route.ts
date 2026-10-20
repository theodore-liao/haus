import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { snapshotNetWorth } from "@/lib/plaid-sync";
import { resolveCrypto } from "@/lib/crypto-assets";
import { enrichCryptoQuotes } from "@/lib/quotes";
import { fetchSpotUsd } from "@/lib/token-prices";
import { bodyId, readJson, updateOrGone } from "@/lib/api";

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
  const parsed = schema.safeParse(await readJson(req));
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
    editedAt: new Date(),
  };
  const id = d.id;
  const row = id
    ? await updateOrGone(() => prisma.manualHolding.update({ where: { id }, data }))
    : await prisma.manualHolding.create({ data });
  if (row instanceof Response) return row;
  await enrichCryptoQuotes().catch(() => null);
  await snapshotNetWorth();
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: Request) {
  await requireSession();
  const id = bodyId(await readJson(req));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // Already gone (removed on another device, or a second click) counts as done.
  await prisma.manualHolding.deleteMany({ where: { id } });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true });
}
