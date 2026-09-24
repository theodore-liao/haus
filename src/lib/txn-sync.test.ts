import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("a posted Plaid id keeps category, merchant, and note from the pending charge", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "haus-txn-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "dev.db")}`;
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });

  const { preservedUserFields } = await import("./txn-user-edit");
  assert.deepEqual(
    preservedUserFields(null, { userCategory: "GROCERIES", userMerchant: "Starbucks", memo: "team coffee" }),
    { userCategory: "GROCERIES", userMerchant: "Starbucks", memo: "team coffee" },
  );
  assert.deepEqual(
    preservedUserFields(
      { userCategory: "DINING", userMerchant: null, memo: null },
      { userCategory: "GROCERIES", userMerchant: "Starbucks", memo: "team coffee" },
    ),
    { userCategory: "DINING", userMerchant: null, memo: null },
  );

  const { prisma } = await import("./db");
  const { applyPlaidTransactionChanges } = await import("./plaid-sync");

  await prisma.plaidItem.create({
    data: { id: "item1", itemId: "plaid-item", accessToken: "sandbox" },
  });
  await prisma.account.create({
    data: {
      id: "acct1",
      plaidAccountId: "plaid-acct",
      itemId: "item1",
      name: "Card",
      type: "credit",
      hausType: "credit",
    },
  });

  async function seedPending(plaidId: string, memo: string) {
    await prisma.txn.create({
      data: {
        plaidTransactionId: plaidId,
        accountId: "acct1",
        date: new Date("2026-09-20T00:00:00Z"),
        name: "STARBUCKS",
        merchantName: "Starbucks",
        amount: 12.5,
        pending: true,
        userCategory: "GROCERIES",
        userMerchant: "Cafe",
        memo,
      },
    });
  }

  const accounts = new Map([["plaid-acct", "acct1"]]);

  await seedPending("pending-same", "same batch");
  const migrated = new Set<string>();
  await applyPlaidTransactionChanges(
    accounts,
    {
      added: [
        {
          transaction_id: "posted-same",
          account_id: "plaid-acct",
          pending: false,
          pending_transaction_id: "pending-same",
          date: "2026-09-22",
          name: "Starbucks",
          merchant_name: "Starbucks",
          amount: 12.5,
        },
      ],
      modified: [],
      removed: [{ transaction_id: "pending-same" }],
    },
    migrated,
  );
  const same = await prisma.txn.findUnique({ where: { plaidTransactionId: "posted-same" } });
  assert.equal(same?.userCategory, "GROCERIES");
  assert.equal(same?.userMerchant, "Cafe");
  assert.equal(same?.memo, "same batch");
  assert.equal(await prisma.txn.findUnique({ where: { plaidTransactionId: "pending-same" } }), null);

  await seedPending("pending-split", "later sync");
  await applyPlaidTransactionChanges(
    accounts,
    { added: [], modified: [], removed: [{ transaction_id: "pending-split" }] },
    new Set(),
  );
  assert.equal(await prisma.txn.findUnique({ where: { plaidTransactionId: "pending-split" } }), null);
  await applyPlaidTransactionChanges(
    accounts,
    {
      added: [
        {
          transaction_id: "posted-split",
          account_id: "plaid-acct",
          pending: false,
          pending_transaction_id: "pending-split",
          date: "2026-09-23",
          name: "Starbucks",
          merchant_name: "Starbucks",
          amount: 12.5,
        },
      ],
      modified: [],
      removed: [],
    },
    new Set(),
  );
  const split = await prisma.txn.findUnique({ where: { plaidTransactionId: "posted-split" } });
  assert.equal(split?.userCategory, "GROCERIES");
  assert.equal(split?.userMerchant, "Cafe");
  assert.equal(split?.memo, "later sync");

  await prisma.txn.create({
    data: {
      plaidTransactionId: "posted-keep",
      accountId: "acct1",
      date: new Date("2026-09-01T00:00:00Z"),
      name: "Rent",
      amount: 100,
      pending: false,
      userCategory: "RENT_AND_UTILITIES",
      memo: "do not wipe",
    },
  });
  await applyPlaidTransactionChanges(
    accounts,
    {
      added: [],
      modified: [
        {
          transaction_id: "posted-keep",
          account_id: "plaid-acct",
          pending: false,
          date: "2026-09-01",
          name: "Rent payment",
          amount: 100,
        },
      ],
      removed: [],
    },
    new Set(),
  );
  const kept = await prisma.txn.findUnique({ where: { plaidTransactionId: "posted-keep" } });
  assert.equal(kept?.name, "Rent payment");
  assert.equal(kept?.userCategory, "RENT_AND_UTILITIES");
  assert.equal(kept?.memo, "do not wipe");

  await prisma.$disconnect();
});
