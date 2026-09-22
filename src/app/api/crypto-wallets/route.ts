import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { snapshotNetWorth } from "@/lib/plaid-sync";
import { addWallet, syncAllWallets, syncWalletById } from "@/lib/crypto-wallets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  address: z.string().min(4),
  label: z.string().optional().nullable(),
  owner: z.string(),
});

export async function POST(req: Request) {
  await requireSession();
  const body = await req.json().catch(() => ({}));
  const action = (body as { action?: string }).action;

  if (action === "sync") {
    const id = (body as { id?: string }).id;
    try {
      if (id) {
        const row = await syncWalletById(id);
        return NextResponse.json({ ok: true, row });
      }
      await syncAllWallets();
      return NextResponse.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not sync wallet.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (action === "rename") {
    const id = (body as { id?: string }).id;
    const label = (body as { label?: string | null }).label;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const trimmed = typeof label === "string" ? label.trim() : "";
    const row = await prisma.cryptoWallet.update({
      where: { id },
      data: { label: trimmed || null },
    });
    return NextResponse.json({ ok: true, row });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a wallet address." }, { status: 400 });
  try {
    const row = await addWallet(parsed.data);
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not add wallet.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  await requireSession();
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.cryptoWallet.delete({ where: { id } });
  await snapshotNetWorth();
  return NextResponse.json({ ok: true });
}
