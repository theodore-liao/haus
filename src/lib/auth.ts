import { timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { publicHttps, sessionSecret, sitePassword } from "./env";

export const SESSION_COOKIE = "haus_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secretKey() {
  return new TextEncoder().encode(sessionSecret());
}

export async function signSession() {
  return new SignJWT({ haus: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

export async function isAuthenticated() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const ok = await isAuthenticated();
  if (!ok) {
    const err = new Error("Unauthorized");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
}

/**
 * Browsers drop an HTTPS-only cookie sent over plain HTTP everywhere except this computer's own address,
 * so a second computer on the home network could never stay signed in. Mark it HTTPS-only when the request was.
 */
export function requestIsHttps(req: Request) {
  if (publicHttps()) return true;
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  return new URL(req.url).protocol === "https:";
}

export function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: requestIsHttps(req),
    path: "/",
    maxAge: MAX_AGE,
  };
}

export function passwordConfigured() {
  return Boolean(sitePassword());
}

export function passwordMatches(input: string) {
  const expected = sitePassword();
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
