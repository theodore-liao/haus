import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const PREFIX = "enc:v1:";
const SALT = "haus-plaid-token-v1";
/** Tokens were sealed with this .env placeholder before a real HAUS_TOKEN_KEY was written. */
const LEGACY_TOKEN_KEYS = ["replace-me-run-node-crypto-randomBytes-32-hex"];

function deriveKey(secret: string) {
  return scryptSync(secret, SALT, 32);
}

function normalizeSecret(s: string | undefined) {
  if (!s) return "";
  let v = s.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v.trim();
}

function secretsToTry() {
  const out: string[] = [];
  for (const s of [process.env.HAUS_TOKEN_KEY, process.env.HAUS_SESSION_SECRET, ...LEGACY_TOKEN_KEYS]) {
    const v = normalizeSecret(s);
    if (v.length >= 16 && !out.includes(v)) out.push(v);
  }
  return out;
}

function encryptWith(secret: string, plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64url");
}

function decryptWith(secret: string, stored: string) {
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function isEncryptedSecret(value: string) {
  return value.startsWith(PREFIX);
}

/** Encrypt for SQLite. No-op until HAUS_TOKEN_KEY is set (except production, which requires it). */
export function encryptSecret(value: string) {
  if (!value) return value;
  const plain = isEncryptedSecret(value) ? decryptSecret(value) : value;
  const key = process.env.HAUS_TOKEN_KEY || "";
  if (key.length >= 16) return encryptWith(key, plain);
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "HAUS_TOKEN_KEY (16+ characters) is required in production. Keep it stable — rotating it makes stored Plaid tokens unreadable.",
    );
  }
  return plain;
}

export function decryptSecret(stored: string) {
  if (!stored || !isEncryptedSecret(stored)) return stored;
  let last: unknown;
  for (const secret of secretsToTry()) {
    try {
      return decryptWith(secret, stored);
    } catch (e) {
      last = e;
    }
  }
  const raw = last instanceof Error ? last.message : "";
  // Node AES-GCM: auth tag mismatch when HAUS_TOKEN_KEY is not the key that encrypted the token.
  if (/unsupported state or unable to authenticate data/i.test(raw)) {
    throw new Error(
      "Cannot decrypt Plaid token. HAUS_TOKEN_KEY does not match the key used when this connection was saved. Relink the same Item (does not use a new Trial slot) or restore the original HAUS_TOKEN_KEY.",
    );
  }
  throw last instanceof Error
    ? last
    : new Error("Cannot decrypt Plaid token. Check HAUS_TOKEN_KEY.");
}

export function plaidAccessToken(item: { accessToken: string }) {
  return decryptSecret(item.accessToken);
}
