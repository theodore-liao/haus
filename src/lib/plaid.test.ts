import assert from "node:assert/strict";
import test from "node:test";
import { Products } from "plaid";
import {
  linkTokenProducts,
  walkTransactionSync,
  withPlaidRetry,
  MUTATION_DURING_PAGINATION,
} from "./plaid";
import { mapPlaidToHausType, plaidCurrentBalance, retainedHausType } from "./account-types";
import { plaidEnv } from "./env";

const plaidError = (code: string, status = 400) => ({
  response: { status, data: { error_code: code, error_message: code } },
});
const noSleep = async () => {};

test("only transactions is required at link time", () => {
  delete process.env.PLAID_PRODUCTS;
  const t = linkTokenProducts();
  assert.deepEqual(t.products, [Products.Transactions]);
  assert.deepEqual(t.required_if_supported_products, [Products.Investments, Products.Liabilities]);
  process.env.PLAID_PRODUCTS = "transactions,auth";
  assert.deepEqual(linkTokenProducts().optional_products, [Products.Auth]);
  delete process.env.PLAID_PRODUCTS;
});

test("PLAID_ENV defaults to production and treats development as production", () => {
  delete process.env.PLAID_ENV;
  assert.equal(plaidEnv(), "production");
  process.env.PLAID_ENV = "sandbox";
  assert.equal(plaidEnv(), "sandbox");
  process.env.PLAID_ENV = "development";
  assert.equal(plaidEnv(), "production");
  delete process.env.PLAID_ENV;
});

test("sync walks every page and returns the last cursor", async () => {
  const pages = [
    { next_cursor: "a", has_more: true },
    { next_cursor: "b", has_more: false },
  ];
  const seen: (string | undefined)[] = [];
  let i = 0;
  const applied: string[] = [];
  const cursor = await walkTransactionSync(
    async (c) => {
      seen.push(c);
      return pages[i++];
    },
    async (p) => void applied.push(p.next_cursor),
    "start",
  );
  assert.equal(cursor, "b");
  assert.deepEqual(seen, ["start", "a"]);
  assert.deepEqual(applied, ["a", "b"]);
});

test("sync restarts from the original cursor when data changes mid-pagination", async () => {
  const seen: (string | undefined)[] = [];
  let call = 0;
  const cursor = await walkTransactionSync(
    async (c) => {
      seen.push(c);
      call++;
      if (call === 2) throw plaidError(MUTATION_DURING_PAGINATION);
      return call === 1 ? { next_cursor: "a", has_more: true } : { next_cursor: "z", has_more: false };
    },
    async () => {},
    "start",
  );
  assert.equal(cursor, "z");
  assert.deepEqual(seen, ["start", "a", "start"]);
});

test("sync gives up after repeated mutation errors and rethrows other errors", async () => {
  await assert.rejects(
    walkTransactionSync(
      async () => {
        throw plaidError(MUTATION_DURING_PAGINATION);
      },
      async () => {},
      null,
      { maxRestarts: 2 },
    ),
  );
  await assert.rejects(
    walkTransactionSync(
      async () => {
        throw plaidError("ITEM_LOGIN_REQUIRED");
      },
      async () => {},
      null,
    ),
  );
});

test("rate limits are retried with backoff, other errors are not", async () => {
  let n = 0;
  const waits: number[] = [];
  const out = await withPlaidRetry(
    async () => {
      if (++n < 3) throw plaidError("RATE_LIMIT_EXCEEDED", 429);
      return "ok";
    },
    { sleep: async (ms) => void waits.push(ms) },
  );
  assert.equal(out, "ok");
  assert.deepEqual(waits, [1000, 2000]);

  n = 0;
  await assert.rejects(
    withPlaidRetry(async () => {
      n++;
      throw plaidError("PRODUCTS_NOT_SUPPORTED");
    }, { sleep: noSleep }),
  );
  assert.equal(n, 1);
});

test("odd Plaid account types fall back without throwing", () => {
  assert.equal(mapPlaidToHausType("investment", "roth 401k"), "roth");
  assert.equal(mapPlaidToHausType("investment", "401a"), "401k");
  assert.equal(mapPlaidToHausType("investment", "thrift savings plan"), "401k");
  assert.equal(mapPlaidToHausType("investment", "non-taxable brokerage account"), "brokerage");
  assert.equal(mapPlaidToHausType("investment", "ugma"), "custodial");
  assert.equal(mapPlaidToHausType("investment", "529"), "529");
  assert.equal(mapPlaidToHausType("investment", "hsa"), "hsa");
  assert.equal(mapPlaidToHausType("investment", null), "brokerage");
  assert.equal(mapPlaidToHausType("loan", "line of credit"), "installment");
  assert.equal(mapPlaidToHausType("credit", "paypal"), "credit_card");
  assert.equal(mapPlaidToHausType("payroll", null), "other_asset");
  assert.equal(mapPlaidToHausType("other", "other"), "other_asset");
  assert.equal(mapPlaidToHausType("", ""), "other_asset");
});

test("credit and loan balances do not fall back to available credit", () => {
  assert.equal(plaidCurrentBalance("credit", { current: null, available: 5000 }), null);
  assert.equal(plaidCurrentBalance("loan", { current: null, available: 5000 }), null);
  assert.equal(plaidCurrentBalance("depository", { current: null, available: 40 }), 40);
  assert.equal(plaidCurrentBalance("credit", { current: 120, available: 5000 }), 120);
  assert.equal(plaidCurrentBalance("investment", { current: null, available: null }), null);
});

test("a hand-set account type survives a resync", () => {
  const acct = { type: "investment", subtype: "ira", hausType: "ira" };
  assert.equal(retainedHausType(acct, "ira"), "ira");
  assert.equal(retainedHausType({ ...acct, hausType: "roth" }, "ira"), "roth");
  assert.equal(retainedHausType(acct, "roth"), "roth");
  assert.equal(retainedHausType(null, "brokerage"), "brokerage");
});
