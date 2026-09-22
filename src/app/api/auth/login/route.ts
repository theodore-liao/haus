import { NextResponse } from "next/server";
import { cookieOptions, passwordConfigured, passwordMatches, SESSION_COOKIE, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // The lock form posts here natively (form-encoded) when JS is unavailable,
  // and via fetch (JSON) once hydrated. Support both.
  const isForm = !(req.headers.get("content-type") ?? "").includes("application/json");
  let password = "";
  if (isForm) {
    password = String((await req.formData()).get("password") ?? "");
  } else {
    const body = (await req.json()) as { password?: string };
    password = body.password ?? "";
  }

  // Relative Location, not NextResponse.redirect(req.url): in dev the request URL is
  // normalized to localhost, which would strand phones browsing via the LAN IP.
  const redirect = (to: string) => new NextResponse(null, { status: 303, headers: { Location: to } });

  const fail = (error: string, status: number) => {
    if (isForm) return redirect("/lock?error=1");
    return NextResponse.json({ error }, { status });
  };

  if (!passwordConfigured()) {
    return fail("Set HAUS_SITE_PASSWORD in .env and restart.", 500);
  }
  if (!password || !passwordMatches(password)) {
    return fail("Denied.", 401);
  }

  const token = await signSession();
  const res = isForm ? redirect("/") : NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return res;
}
