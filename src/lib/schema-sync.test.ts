import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const prismaBin = path.join(root, "node_modules", "prisma", "build", "index.js");

function envFor(dbFile: string) {
  return { ...process.env, DATABASE_URL: `file:${dbFile}` };
}

function prismaCmd(args: string[], env: NodeJS.ProcessEnv, input?: string) {
  execFileSync(process.execPath, [prismaBin, ...args], {
    cwd: root,
    env,
    stdio: input === undefined ? "pipe" : ["pipe", "pipe", "pipe"],
    input,
  });
}

function migrateOnly(env: NodeJS.ProcessEnv) {
  prismaCmd(["migrate", "deploy"], env);
}

function syncDb(env: NodeJS.ProcessEnv) {
  execFileSync(process.execPath, [path.join(root, "scripts", "sync-db.mjs")], {
    cwd: root,
    env,
    stdio: "pipe",
  });
}

test("a database created from migrations can open the home page after the build sync", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "haus-schema-fresh-"));
  const env = envFor(path.join(dir, "dev.db"));
  migrateOnly(env);
  syncDb(env);

  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  try {
    const household = await prisma.household.upsert({
      where: { id: "haus" },
      create: { id: "haus", nameA: "One", nameB: "" },
      update: {},
    });
    assert.equal(household.pairCardPayments, true);
    assert.equal(await prisma.manualHolding.count(), 0);
    assert.equal(await prisma.cryptoWallet.count(), 0);
  } finally {
    await prisma.$disconnect();
  }
});

test("the build sync keeps household rows and stashed edits while adding the missing tables", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "haus-schema-old-"));
  const dbFile = path.join(dir, "dev.db");
  const env = envFor(dbFile);
  migrateOnly(env);

  const sql = path.join(dir, "seed.sql");
  writeFileSync(
    sql,
    `
ALTER TABLE "Household" ADD COLUMN "birthdateA" DATETIME;
ALTER TABLE "Household" ADD COLUMN "budgetsSeeded" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Household" ADD COLUMN "projectionPrefs" TEXT;
ALTER TABLE "Household" ADD COLUMN "transactionsStoredSince" DATETIME;
ALTER TABLE "Household" ADD COLUMN "keepTransactions" BOOLEAN NOT NULL DEFAULT 0;
INSERT INTO "Household" ("id", "nameA", "nameB", "quoteApiKey", "createdAt", "updatedAt", "birthdateA", "budgetsSeeded", "projectionPrefs", "transactionsStoredSince", "keepTransactions")
VALUES ('haus', 'Primary', 'Second', NULL, '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', '1990-01-02T00:00:00.000Z', 1, '{"retireAge":60}', 1714521600000, 1);
CREATE TABLE "TxnUserEdit" (
  "plaidTransactionId" TEXT NOT NULL PRIMARY KEY,
  "userCategory" TEXT,
  "userMerchant" TEXT,
  "memo" TEXT
);
INSERT INTO "TxnUserEdit" ("plaidTransactionId", "userCategory", "userMerchant", "memo")
VALUES ('txn1', 'Groceries', 'Store', 'note');
INSERT INTO "MerchantRule" ("merchantKey", "category", "displayName") VALUES ('shop', 'Shopping', 'Shop');
INSERT INTO "Property" ("id", "label", "estimate", "asOfDate", "owner", "createdAt", "updatedAt")
VALUES ('prop1', 'Home', 100, '2024-01-01T00:00:00.000Z', 'joint', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z');
CREATE TABLE "CategoryBudget" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "category" TEXT NOT NULL,
  "monthly" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "CategoryBudget" ("id", "category", "monthly", "createdAt", "updatedAt")
VALUES ('b1', 'Dining', 40, '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z');
`,
  );
  prismaCmd(["db", "execute", "--file", sql, "--url", env.DATABASE_URL!], env);

  syncDb(env);

  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  try {
    const household = await prisma.household.upsert({
      where: { id: "haus" },
      create: { id: "haus", nameA: "One", nameB: "" },
      update: {},
    });
    assert.equal(household.nameA, "Primary");
    assert.equal(household.nameB, "Second");
    assert.equal(household.budgetsSeeded, true);
    assert.equal(household.keepTransactions, true);
    assert.equal(household.pairCardPayments, true);
    assert.equal(household.projectionPrefs, '{"retireAge":60}');
    assert.equal(household.birthdateA?.toISOString().slice(0, 10), "1990-01-02");
    assert.ok(household.transactionsStoredSince);
    assert.equal(await prisma.manualHolding.count(), 0);
    assert.equal(await prisma.cryptoWallet.count(), 0);
    const edits = await prisma.txnUserEdit.findMany();
    assert.deepEqual(edits, [
      { plaidTransactionId: "txn1", userCategory: "Groceries", userMerchant: "Store", memo: "note" },
    ]);
    const rules = await prisma.merchantRule.findMany();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].merchantKey, "shop");
    assert.equal(rules[0].hidden, false);
    const property = await prisma.property.findUnique({ where: { id: "prop1" } });
    assert.equal(property?.label, "Home");
    assert.equal(property?.estimate, 100);
    const budget = await prisma.categoryBudget.findUnique({ where: { category: "Dining" } });
    assert.equal(budget?.monthly, 40);

    syncDb(env);
    const again = await prisma.household.findUnique({ where: { id: "haus" } });
    assert.equal(again?.nameA, "Primary");
    assert.equal(again?.projectionPrefs, '{"retireAge":60}');
    assert.equal(await prisma.txnUserEdit.count(), 1);
  } finally {
    await prisma.$disconnect();
  }
});
