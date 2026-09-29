import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import { plaidEnv, plaidProducts } from "./env";

let client: PlaidApi | null = null;

export function getPlaidClient() {
  if (client) return client;
  const env = plaidEnv();
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
        "PLAID-SECRET": process.env.PLAID_SECRET ?? "",
      },
    },
  });
  client = new PlaidApi(configuration);
  return client;
}

const PRODUCT_MAP: Record<string, Products> = {
  transactions: Products.Transactions,
  investments: Products.Investments,
  liabilities: Products.Liabilities,
  auth: Products.Auth,
  identity: Products.Identity,
};

export function requestedProducts(): Products[] {
  return plaidProducts()
    .map((p) => PRODUCT_MAP[p])
    .filter(Boolean);
}

/**
 * Transactions is the only required product so banks and brokerages can share one Link
 * session. Investments, liabilities and identity attach when the selected accounts support
 * them. Auth goes in optional_products, which Plaid accepts for any product.
 */
export function linkTokenProducts(): {
  products: Products[];
  required_if_supported_products?: Products[];
  optional_products?: Products[];
} {
  const wanted = requestedProducts().filter((p) => p !== Products.Transactions);
  const products = [Products.Transactions];
  const optional = wanted.filter((p) => p === Products.Auth);
  const supported = wanted.filter((p) => p !== Products.Auth);
  return {
    products,
    ...(supported.length ? { required_if_supported_products: supported } : {}),
    ...(optional.length ? { optional_products: optional } : {}),
  };
}

export const SOFT_PLAID_CODES = new Set([
  "PRODUCTS_NOT_SUPPORTED",
  "PRODUCT_NOT_READY",
  "NO_INVESTMENT_ACCOUNTS",
  "NO_LIABILITY_ACCOUNTS",
  "NO_ACCOUNTS",
  "ACCESS_NOT_GRANTED",
  "INVALID_PRODUCT",
  "ADDITIONAL_CONSENT_REQUIRED",
]);

export const PLAID_COUNTRY = [CountryCode.Us];

/** Max Plaid will fetch on a new Item. Default without this is 90 days. */
export const PLAID_TXN_HISTORY_DAYS = 730;

export function plaidErr(e: unknown): { code: string; message: string } {
  const err = e as {
    response?: { data?: { error_code?: string; error_message?: string } };
    message?: string;
  };
  return {
    code: err.response?.data?.error_code ?? "UNKNOWN",
    message: err.response?.data?.error_message ?? err.message ?? "Unknown Plaid error",
  };
}

const RATE_LIMIT_CODES = new Set([
  "RATE_LIMIT_EXCEEDED",
  "TRANSACTIONS_LIMIT",
  "INVESTMENTS_LIMIT",
  "LIABILITIES_LIMIT",
  "ACCOUNTS_LIMIT",
  "INSTITUTION_RATE_LIMIT",
]);

export const MUTATION_DURING_PAGINATION = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";

export function isRateLimited(e: unknown): boolean {
  const status = (e as { response?: { status?: number } }).response?.status;
  return status === 429 || RATE_LIMIT_CODES.has(plaidErr(e).code);
}

/** Retry a Plaid call with backoff when Plaid rate-limits it. Other errors pass through. */
export async function withPlaidRetry<T>(
  fn: () => Promise<T>,
  opts: { tries?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const tries = opts.tries ?? 4;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= tries || !isRateLimited(e)) throw e;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
}

/**
 * Walk /transactions/sync pages from a cursor. If Plaid reports the data changed mid-walk,
 * start again from the original cursor (pages are applied as idempotent upserts).
 * Returns the final cursor.
 */
export async function walkTransactionSync<P extends { next_cursor: string; has_more: boolean }>(
  fetchPage: (cursor: string | undefined) => Promise<P>,
  onPage: (page: P) => Promise<void>,
  startCursor: string | null,
  opts: { maxRestarts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<string | undefined> {
  const maxRestarts = opts.maxRestarts ?? 3;
  for (let restart = 0; ; restart++) {
    let next = startCursor ?? undefined;
    try {
      let hasMore = true;
      while (hasMore) {
        const cursor = next;
        const page = await withPlaidRetry(() => fetchPage(cursor), { sleep: opts.sleep });
        await onPage(page);
        next = page.next_cursor;
        hasMore = page.has_more;
      }
      return next;
    } catch (e) {
      if (plaidErr(e).code === MUTATION_DURING_PAGINATION && restart < maxRestarts) continue;
      throw e;
    }
  }
}
