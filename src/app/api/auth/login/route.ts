import { NextResponse } from "next/server";
import { cookieOptions, passwordConfigured, passwordMatches, SESSION_COOKIE, signSession } from "@/lib/auth";
import { createLoginLimits, loginWait, recordMiss, recordSuccess, requestAddress, waitMessage, type LoginLimits } from "@/lib/login-limit";

export const dynamic = "force-dynamic";

const store = globalThis as unknown as { hausLoginLimits?: LoginLimits };
const limits = (store.hausLoginLimits ??= createLoginLimits());

export async function POST(req: Request) {
  // The lock form posts here natively (form-encoded) when JS is unavailable,
  // and via fetch (JSON) once hydrated. Support both.
  const isForm = !(req.headers.get("content-type") ?? "").includes("application/json");

  // Relative Location, not NextResponse.redirect(req.url): in dev the request URL is
  // normalized to localhost, which would strand phones browsing via the LAN IP.
  const redirect = (to: string) => new NextResponse(null, { status: 303, headers: { Location: to } });

  const fail = (error: string, status: number, code = "1") => {
    if (isForm) return redirect(`/lock?error=${code}`);
    return NextResponse.json({ error }, { status });
  };

  const address = requestAddress(req.headers);
  const wait = loginWait(limits, address);
  if (wait > 0) return fail(waitMessage(wait), 429, "locked");

  let password = "";
  if (isForm) {
    password = String((await req.formData()).get("password") ?? "");
  } else {
    const body = (await req.json().catch(() => ({}))) as { password?: string };
    password = body.password ?? "";
  }

  if (!passwordConfigured()) {
    return fail("Set HAUS_SITE_PASSWORD in .env and restart.", 500);
  }
  if (!password || !passwordMatches(password)) {
    recordMiss(limits, address);
    const locked = loginWait(limits, address);
    if (locked > 0) return fail(waitMessage(locked), 429, "locked");
    return fail("Denied.", 401);
  }

  recordSuccess(limits, address);
  const token = await signSession();
  const res = isForm ? redirect("/") : NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(req));
  return res;
}
