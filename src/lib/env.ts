export function plaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function plaidEnv() {
  const env = (process.env.PLAID_ENV || "sandbox").toLowerCase();
  if (env === "production" || env === "development" || env === "sandbox") return env;
  return "sandbox";
}

export function plaidProducts() {
  const raw = process.env.PLAID_PRODUCTS || "transactions,investments,liabilities";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function sitePassword() {
  return process.env.HAUS_SITE_PASSWORD || "";
}

export function sessionSecret() {
  const secret = process.env.HAUS_SESSION_SECRET || "";
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("HAUS_SESSION_SECRET is required in production.");
  }
  return "haus-dev-secret-not-for-production-use";
}

export function allowedEmails() {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function publicHttps() {
  if (process.env.HAUS_HTTPS === "1") return true;
  const url = process.env.HAUS_PUBLIC_URL || "";
  return url.startsWith("https://") || process.env.NODE_ENV === "production";
}

export function finnhubKey(dbKey?: string | null) {
  return process.env.FINNHUB_API_KEY || dbKey || "";
}
