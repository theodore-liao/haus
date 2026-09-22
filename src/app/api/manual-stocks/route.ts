import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { snapshotNetWorth } from "@/lib/plaid-sync";
import { FIXED_USD_ID } from "@/lib/constants";
import { fetchEquitySpot } from "@/lib/quotes";

export const dynamic = "force-dynamic";

const meta = {
  id: z.string().optional(),
  assetClass: z.enum(["equity", "etf"]),
  accountName: z.string().min(1).max(80),
  owner: z.string(),
  notes: z.string().optional(),
};

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("shares"),
    symbol: z.string().min(1).max(12),
    quantity: z.coerce.number().positive(),
    costPerShare: z.number().nonnegative().nullable().optional(),
    ...meta,
  }),
  z.object({
    mode: z.literal("value"),
    name: z.string().min(1).max(80),
    value: z.coerce.number().positive(),
    costBasis: z.number().nonnegative().nullable().optional(),
    ...meta,
  }),
]);

function slugSymbol(name: string) {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8);
  return slug || "HOLDING";
}

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const d = parsed.data;

  if (d.mode === "shares") {
    const symbol = d.symbol.trim().toUpperCase();
    if (!/^[A-Z0-9.\-]{1,8}$/.test(symbol)) {
      return NextResponse.json({ error: "Use a ticker like AAPL or BRK.B." }, { status: 400 });
    }
    const spot = await fetchEquitySpot(symbol);
    if (!spot) {
      return NextResponse.json({ error: `No quote for ${symbol}. Check the ticker.` }, { status: 400 });
    }
    const payload = {
      kind: "security" as const,
      symbol,
      name: spot.name || symbol,
      quantity: d.quantity,
      owner: d.owner,
      notes: d.notes,
      quotePrice: spot.price,
      quoteChange: spot.change,
      quoteChangePct: spot.changePct,
      quoteAsOf: spot.asOf,
      costBasis: d.costPerShare == null ? null : d.costPerShare * d.quantity,
      editedAt: new Date(),
      assetClass: d.assetClass,
      accountName: d.accountName.trim(),
    };
    if (d.id) await prisma.manualHolding.update({ where: { id: d.id }, data: payload });
    else await prisma.manualHolding.create({ data: payload });
    await snapshotNetWorth().catch(() => null);
    return NextResponse.json({ ok: true });
  }

  const payload = {
    kind: "security" as const,
    symbol: slugSymbol(d.name),
    coingeckoId: FIXED_USD_ID,
    name: d.name.trim(),
    quantity: 1,
    owner: d.owner,
    notes: d.notes,
    quotePrice: d.value,
    quoteChange: 0,
    quoteChangePct: 0,
    quoteAsOf: new Date(),
    costBasis: d.costBasis ?? null,
    editedAt: new Date(),
    assetClass: d.assetClass,
    accountName: d.accountName.trim(),
  };
  if (d.id) await prisma.manualHolding.update({ where: { id: d.id }, data: payload });
  else await prisma.manualHolding.create({ data: payload });
  await snapshotNetWorth().catch(() => null);
  return NextResponse.json({ ok: true });
}
