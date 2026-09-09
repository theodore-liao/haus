import { NextResponse } from "next/server";
import { CountryCode } from "plaid";
import { prisma } from "@/lib/db";
import { getPlaidClient, linkTokenProducts, plaidErr } from "@/lib/plaid";
import { plaidConfigured, plaidEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth";
import { plaidAccessToken } from "@/lib/token-crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireSession();
  if (!plaidConfigured()) {
    return NextResponse.json(
      {
        error:
          "Plaid is not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to .env, then restart.",
      },
      { status: 400 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { itemId?: string; relink?: boolean };
  const plaid = getPlaidClient();
  try {
    if (body.relink && body.itemId) {
      const item = await prisma.plaidItem.findUnique({ where: { id: body.itemId } });
      if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
      const created = await plaid.linkTokenCreate({
        user: { client_user_id: "haus-household" },
        client_name: "Haus",
        country_codes: [CountryCode.Us],
        language: "en",
        access_token: plaidAccessToken(item),
      });
      return NextResponse.json({ link_token: created.data.link_token });
    }

    const created = await plaid.linkTokenCreate({
      user: { client_user_id: "haus-household" },
      client_name: "Haus",
      country_codes: [CountryCode.Us],
      language: "en",
      ...linkTokenProducts(),
    });
    return NextResponse.json({ link_token: created.data.link_token });
  } catch (e) {
    const err = plaidErr(e);
    const message =
      err.code === "INVALID_API_KEYS"
        ? `Plaid rejected these keys for the ${plaidEnv()} environment. Sandbox and production secrets are different — set PLAID_ENV to match the keys you pasted, then restart.`
        : err.message;
    return NextResponse.json({ error: message, code: err.code }, { status: 400 });
  }
}
