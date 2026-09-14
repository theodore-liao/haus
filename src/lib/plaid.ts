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
 * session. Investments and liabilities attach when the selected accounts support them.
 */
export function linkTokenProducts(): {
  products: Products[];
  required_if_supported_products?: Products[];
} {
  const wanted = requestedProducts();
  const products = [Products.Transactions];
  const extra = wanted.filter((p) => p !== Products.Transactions);
  return extra.length ? { products, required_if_supported_products: extra } : { products };
}

export const SOFT_PLAID_CODES = new Set([
  "PRODUCTS_NOT_SUPPORTED",
  "PRODUCT_NOT_READY",
  "NO_INVESTMENT_ACCOUNTS",
  "NO_LIABILITY_ACCOUNTS",
  "NO_ACCOUNTS",
  "ACCESS_NOT_GRANTED",
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
