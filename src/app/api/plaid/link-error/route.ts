import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { linkExitLogLine, type LinkExitError } from "@/lib/plaid-link-error";

export const dynamic = "force-dynamic";

/** Plaid Link errors happen in the browser; this puts them in the server's own log so they can be looked up later. */
export async function POST(req: Request) {
  await requireSession();
  const body = (await req.json().catch(() => null)) as {
    error?: LinkExitError | null;
    institution?: string | null;
    institutionId?: string | null;
    status?: string | null;
    linkSessionId?: string | null;
    requestId?: string | null;
    relink?: boolean;
  } | null;
  if (!body?.error) return NextResponse.json({ ok: false }, { status: 400 });
  console.warn(linkExitLogLine(body));
  return NextResponse.json({ ok: true });
}
