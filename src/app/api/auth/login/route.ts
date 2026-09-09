import { NextResponse } from "next/server";
import { cookieOptions, passwordConfigured, passwordMatches, SESSION_COOKIE, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!passwordConfigured()) {
    return NextResponse.json(
      { error: "Set HAUS_SITE_PASSWORD in .env and restart." },
      { status: 500 },
    );
  }
  const body = (await req.json()) as { password?: string };
  if (!body.password || !passwordMatches(body.password)) {
    return NextResponse.json({ error: "Denied." }, { status: 401 });
  }
  const token = await signSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return res;
}
