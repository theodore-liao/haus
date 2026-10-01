export function plaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

/** Real banks need production. Plaid retired "development" in 2024, so it maps to production. */
export function plaidEnv(): "production" | "sandbox" {
  return (process.env.PLAID_ENV || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
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

/** Set when Haus is only ever served over HTTPS, so the login cookie is always HTTPS-only. */
export function publicHttps() {
  if (process.env.HAUS_HTTPS === "1") return true;
  return (process.env.HAUS_PUBLIC_URL || "").startsWith("https://");
}

export function finnhubKey(dbKey?: string | null) {
  return process.env.FINNHUB_API_KEY || dbKey || "";
}
