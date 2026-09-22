import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCardPaymentFlags } from "@/lib/card-payments";
import { merchantKey, ruleKeyFor, scopeMatches } from "@/lib/categories";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string(),
  userCategory: z.string().nullable().optional(),
  userMerchant: z.string().nullable().optional(),
  applyToMerchant: z.boolean().optional(),
  /** Limit the merchant rule to the account this transaction posted on. */
  onlyAccount: z.boolean().optional(),
  /** Case-insensitive phrase that must appear in the bank description. */
  nameContains: z.string().optional(),
});

export async function PATCH(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const txn = await prisma.txn.update({
    where: { id: parsed.data.id },
    data: {
      userCategory: parsed.data.userCategory,
      userMerchant: parsed.data.userMerchant,
    },
  });
  if (parsed.data.applyToMerchant) {
    const nameContains = (parsed.data.nameContains ?? "").trim().toLowerCase();
    const accountId = parsed.data.onlyAccount ? txn.accountId : "";
    const scoped = Boolean(accountId || nameContains);
    if (scoped) {
      // One shared bank description can be two different cards. Store the narrower rule
      // under the Plaid merchant (or the raw line) and do not write a blanket rule.
      const merchantKeyForScope = merchantKey(txn.merchantName || txn.name || parsed.data.userMerchant);
      if (merchantKeyForScope) {
        await prisma.merchantMatch.upsert({
          where: {
            merchantKey_accountId_nameContains: {
              merchantKey: merchantKeyForScope,
              accountId,
              nameContains,
            },
          },
          create: {
            merchantKey: merchantKeyForScope,
            accountId,
            nameContains,
            category: parsed.data.userCategory ?? null,
            displayName: parsed.data.userMerchant ?? null,
          },
          update: {
            category: parsed.data.userCategory ?? null,
            displayName: parsed.data.userMerchant ?? null,
          },
        });
      }
      const all = await prisma.txn.findMany({
        select: { id: true, accountId: true, merchantName: true, userMerchant: true, name: true },
      });
      const flags = await loadCardPaymentFlags();
      const ids = all
        .filter((row) => scopeMatches({ merchantKey: merchantKeyForScope, accountId, nameContains }, row))
        .filter((row) => !flags.paired.has(row.id))
        .map((row) => row.id);
      if (ids.length) {
        await prisma.txn.updateMany({
          where: { id: { in: ids } },
          data: {
            userCategory: parsed.data.userCategory ?? undefined,
            userMerchant: parsed.data.userMerchant ?? undefined,
          },
        });
      }
    } else {
      const flags = await loadCardPaymentFlags();
      const matched = flags.paired.has(txn.id);
      const bases = [
        ...new Set([txn.merchantName, txn.name, txn.userMerchant, parsed.data.userMerchant].map((x) => merchantKey(x)).filter(Boolean)),
      ];
      for (const base of bases) {
        const key = ruleKeyFor(base, matched);
        await prisma.merchantRule.upsert({
          where: { merchantKey: key },
          create: {
            merchantKey: key,
            category: parsed.data.userCategory ?? undefined,
            displayName: parsed.data.userMerchant ?? undefined,
          },
          update: {
            category: parsed.data.userCategory ?? undefined,
            displayName: parsed.data.userMerchant ?? undefined,
          },
        });
      }
      const all = await prisma.txn.findMany({
        select: { id: true, merchantName: true, userMerchant: true, name: true },
      });
      const ids = all
        .filter((row) => {
          const sameName = [row.merchantName, row.userMerchant, row.name].some((x) => bases.includes(merchantKey(x)));
          return sameName && flags.paired.has(row.id) === matched;
        })
        .map((row) => row.id);
      if (ids.length) {
        await prisma.txn.updateMany({
          where: { id: { in: ids } },
          data: {
            userCategory: parsed.data.userCategory ?? undefined,
            userMerchant: parsed.data.userMerchant ?? undefined,
          },
        });
      }
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  await requireSession();
  const body = (await req.json().catch(() => ({}))) as { merchant?: string; rawMerchant?: string | null; name?: string };
  const keys = [...new Set([merchantKey(body.merchant), merchantKey(body.rawMerchant), merchantKey(body.name)].filter(Boolean))];
  if (!keys.length) return NextResponse.json({ error: "Merchant required." }, { status: 400 });
  for (const key of keys) {
    await prisma.merchantRule.upsert({
      where: { merchantKey: key },
      create: { merchantKey: key, hidden: true },
      update: { hidden: true },
    });
  }
  return NextResponse.json({ ok: true });
}
