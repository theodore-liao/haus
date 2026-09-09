import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = new Set(["/lock", "/api/auth/login", "/api/plaid/webhook"]);

function secret() {
  const s = process.env.HAUS_SESSION_SECRET;
  if (s) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV === "production") {
    return new TextEncoder().encode("missing-session-secret-reject-all");
  }
  return new TextEncoder().encode("haus-dev-secret-not-for-production-use");
}

function allowedEmails() {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function accessEmailAllowed(req: NextRequest) {
  const allow = allowedEmails();
  if (!allow.length) return true;
  const email = (req.headers.get("cf-access-authenticated-user-email") || "").toLowerCase();
  if (!email) {
    // Local `next dev` has no Cloudflare Access header.
    return process.env.NODE_ENV !== "production";
  }
  return allow.includes(email);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  if (!accessEmailAllowed(req)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    return new NextResponse("Forbidden.", { status: 403 });
  }

  const token = req.cookies.get("haus_session")?.value;
  let ok = false;
  if (token) {
    try {
      await jwtVerify(token, secret());
      ok = true;
    } catch {
      ok = false;
    }
  }

  if (PUBLIC.has(pathname) || pathname.startsWith("/api/plaid/webhook")) {
    if (ok && pathname === "/lock") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!ok) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/lock";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
