import { prisma } from "./db";

/** Household overrides that must survive a Plaid id change. */
export type TxnUserFields = {
  userCategory: string | null;
  userMerchant: string | null;
  memo: string | null;
};

export function hasTxnUserFields(row: TxnUserFields | null | undefined) {
  return Boolean(row && (row.userCategory || row.userMerchant || row.memo));
}

/**
 * A posted transaction keeps edits already stored on its own row.
 * A brand-new posted id inherits the pending row (or a stash of it) instead.
 */
export function preservedUserFields(existing: TxnUserFields | null, fallback: TxnUserFields | null): TxnUserFields {
  const src = existing ?? fallback;
  return {
    userCategory: src?.userCategory ?? null,
    userMerchant: src?.userMerchant ?? null,
    memo: src?.memo ?? null,
  };
}

let tableReady = false;

export async function ensureTxnUserEditTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TxnUserEdit" (
      "plaidTransactionId" TEXT NOT NULL PRIMARY KEY,
      "userCategory" TEXT,
      "userMerchant" TEXT,
      "memo" TEXT
    )
  `);
  tableReady = true;
}

/** Remember edits before the live row is deleted. A later posted id can claim them. */
export async function stashTxnUserEdit(plaidTransactionId: string, fields: TxnUserFields) {
  if (!hasTxnUserFields(fields)) return;
  await ensureTxnUserEditTable();
  const existing = await prisma.$queryRaw<{ plaidTransactionId: string }[]>`
    SELECT "plaidTransactionId" FROM "TxnUserEdit" WHERE "plaidTransactionId" = ${plaidTransactionId}
  `;
  if (existing.length) {
    await prisma.$executeRaw`
      UPDATE "TxnUserEdit"
      SET "userCategory" = ${fields.userCategory},
          "userMerchant" = ${fields.userMerchant},
          "memo" = ${fields.memo}
      WHERE "plaidTransactionId" = ${plaidTransactionId}
    `;
    return;
  }
  await prisma.$executeRaw`
    INSERT INTO "TxnUserEdit" ("plaidTransactionId", "userCategory", "userMerchant", "memo")
    VALUES (${plaidTransactionId}, ${fields.userCategory}, ${fields.userMerchant}, ${fields.memo})
  `;
}

export async function readTxnUserEdit(plaidTransactionId: string): Promise<TxnUserFields | null> {
  await ensureTxnUserEditTable();
  const rows = await prisma.$queryRaw<TxnUserFields[]>`
    SELECT "userCategory", "userMerchant", "memo"
    FROM "TxnUserEdit"
    WHERE "plaidTransactionId" = ${plaidTransactionId}
  `;
  return rows[0] ?? null;
}

export async function deleteTxnUserEdit(plaidTransactionId: string) {
  await ensureTxnUserEditTable();
  await prisma.$executeRaw`DELETE FROM "TxnUserEdit" WHERE "plaidTransactionId" = ${plaidTransactionId}`;
}
