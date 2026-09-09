import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPlaidClient, plaidErr } from "@/lib/plaid";
import { mapPlaidToHausType } from "@/lib/account-types";
import { requireSession } from "@/lib/auth";
import { plaidConfigured, plaidProducts } from "@/lib/env";
import { encryptSecret } from "@/lib/token-crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireSession();
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
  }
  const body = (await req.json()) as { public_token?: string; itemId?: string };
  if (!body.public_token) {
    return NextResponse.json({ error: "public_token required." }, { status: 400 });
  }
  const plaid = getPlaidClient();
  try {
    const exchanged = await plaid.itemPublicTokenExchange({ public_token: body.public_token });
    const accessToken = exchanged.data.access_token;
    const itemId = exchanged.data.item_id;

    const accountsRes = await plaid.accountsGet({ access_token: accessToken });
    let institutionName: string | null = null;
    let institutionId: string | null = accountsRes.data.item.institution_id ?? null;
    if (institutionId) {
      try {
        const inst = await plaid.institutionsGetById({
          institution_id: institutionId,
          country_codes: ["US"] as never,
        });
        institutionName = inst.data.institution.name;
      } catch {
        institutionName = null;
      }
    }

    const sealed = encryptSecret(accessToken);
    const item = await prisma.plaidItem.upsert({
      where: { itemId },
      create: {
        itemId,
        accessToken: sealed,
        institutionId,
        institutionName,
        products: JSON.stringify(plaidProducts()),
        status: "good",
      },
      update: {
        accessToken: sealed,
        institutionId,
        institutionName,
        status: "good",
        errorCode: null,
        errorMessage: null,
      },
    });

    const accounts = [];
    for (const a of accountsRes.data.accounts) {
      const hausType = mapPlaidToHausType(a.type, a.subtype ?? null);
      const acc = await prisma.account.upsert({
        where: { plaidAccountId: a.account_id },
        create: {
          plaidAccountId: a.account_id,
          itemId: item.id,
          name: a.name,
          officialName: a.official_name ?? undefined,
          mask: a.mask ?? undefined,
          type: a.type,
          subtype: a.subtype ?? undefined,
          hausType,
          owner: item.defaultOwner,
          currentBalance: a.balances.current ?? undefined,
          availableBalance: a.balances.available ?? undefined,
          limitAmount: a.balances.limit ?? undefined,
        },
        update: {
          name: a.name,
          mask: a.mask ?? undefined,
          hausType,
        },
      });
      accounts.push({
        id: acc.id,
        name: acc.name,
        mask: acc.mask,
        hausType: acc.hausType,
        owner: acc.owner,
      });
    }

    return NextResponse.json({
      item: {
        id: item.id,
        institutionName: item.institutionName,
        accounts,
      },
    });
  } catch (e) {
    const err = plaidErr(e);
    return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
  }
}
