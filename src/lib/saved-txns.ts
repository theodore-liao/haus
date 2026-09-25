import { prisma } from "./db";
import { accountLabel } from "./account-label";
import { loadCardPaymentFlags } from "./card-payments";
import { effectiveCategory, isInternalMove } from "./categories";
import { ownerLabel, type HouseholdNames } from "./owners";
import { getNames } from "./queries";
import { savedOwnerNow } from "./report-archive";
import type { TxnRow } from "./txn-row";

const WRITE_CHUNK = 80;

type LiveTxn = {
  id: string;
  plaidTransactionId: string;
  accountId: string;
  date: Date;
  name: string;
  merchantName: string | null;
  userMerchant: string | null;
  userCategory: string | null;
  categoryPrimary: string | null;
  categoryDetailed: string | null;
  memo: string | null;
  amount: number;
  pending: boolean;
  isTransfer: boolean;
  isCcPayment: boolean;
  account: {
    name: string;
    mask: string | null;
    owner: string;
    item: { institutionName: string | null };
  };
};

function ledgerMerchant(t: { userMerchant?: string | null; merchantName?: string | null; name: string }) {
  return t.userMerchant || t.merchantName || t.name;
}

async function keeping() {
  const row = await prisma.household.findUnique({
    where: { id: "haus" },
    select: { keepTransactions: true },
  });
  return Boolean(row?.keepTransactions);
}

function snapshot(t: LiveTxn, paired: boolean) {
  const merchant = ledgerMerchant(t);
  const fields = {
    userCategory: t.userCategory,
    categoryPrimary: t.categoryPrimary,
    categoryDetailed: t.categoryDetailed,
    merchant,
    merchantName: t.merchantName,
    userMerchant: t.userMerchant,
    name: t.name,
    pairedTransfer: paired,
    isTransfer: t.isTransfer,
    isCcPayment: t.isCcPayment,
  };
  return {
    plaidTransactionId: t.plaidTransactionId,
    accountId: t.accountId,
    date: t.date,
    name: t.name,
    merchant,
    rawMerchant: t.merchantName,
    accountName: accountLabel(t.account.name, t.account.item.institutionName),
    accountMask: t.account.mask,
    institutionName: t.account.item.institutionName,
    owner: t.account.owner,
    category: effectiveCategory(fields),
    categoryDetailed: t.categoryDetailed,
    amount: t.amount,
    isTransfer: t.isTransfer,
    isCcPayment: t.isCcPayment,
    internal: isInternalMove(fields),
    cardMatch: paired ? "matched" : null,
    memo: t.memo,
  };
}

async function writeSnapshots(txns: LiveTxn[]) {
  const posted = txns.filter((t) => !t.pending && t.plaidTransactionId);
  if (!posted.length) return;
  const flags = await loadCardPaymentFlags();
  const rows = posted.map((t) => snapshot(t, flags.enabled && flags.paired.has(t.id)));
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const chunk = rows.slice(i, i + WRITE_CHUNK);
    await prisma.$transaction(
      chunk.map((row) =>
        prisma.savedTxn.upsert({
          where: { plaidTransactionId: row.plaidTransactionId },
          create: row,
          update: row,
        }),
      ),
    );
  }
}

async function loadPosted(field: "id" | "plaidTransactionId", ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: LiveTxn[] = [];
  for (let i = 0; i < unique.length; i += 400) {
    const slice = unique.slice(i, i + 400);
    const found = await prisma.txn.findMany({
      where: { pending: false, [field]: { in: slice } },
      include: { account: { include: { item: true } } },
    });
    out.push(...found);
  }
  return out;
}

/** Copy the posted rows that were just synced or edited. Pending rows wait until they post. Never deletes. */
export async function archiveTransactions(selector: { id?: string[]; plaidTransactionId?: string[] }) {
  if (!(await keeping())) return;
  const [byId, byPlaid] = await Promise.all([
    selector.id?.length ? loadPosted("id", selector.id) : Promise.resolve([]),
    selector.plaidTransactionId?.length
      ? loadPosted("plaidTransactionId", selector.plaidTransactionId)
      : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const merged = [...byId, ...byPlaid].filter((t) => {
    if (seen.has(t.plaidTransactionId)) return false;
    seen.add(t.plaidTransactionId);
    return true;
  });
  await writeSnapshots(merged);
}

/** Upsert every posted transaction already on the ledger. Never deletes SavedTxn rows. */
export async function backfillSavedTransactions() {
  if (!(await keeping())) return;
  const txns = await prisma.txn.findMany({
    where: { pending: false },
    include: { account: { include: { item: true } } },
  });
  await writeSnapshots(txns);
}

type SavedRow = {
  plaidTransactionId: string;
  date: Date;
  name: string;
  merchant: string;
  rawMerchant: string | null;
  accountName: string;
  accountMask: string | null;
  institutionName: string | null;
  owner: string;
  category: string | null;
  categoryDetailed: string | null;
  amount: number;
  isTransfer: boolean;
  isCcPayment: boolean;
  internal: boolean;
  cardMatch: string | null;
  memo: string | null;
};

function presentLive(t: LiveTxn, names: HouseholdNames, paired: boolean): TxnRow {
  const merchant = ledgerMerchant(t);
  const fields = {
    userCategory: t.userCategory,
    categoryPrimary: t.categoryPrimary,
    categoryDetailed: t.categoryDetailed,
    merchant,
    merchantName: t.merchantName,
    userMerchant: t.userMerchant,
    name: t.name,
    pairedTransfer: paired,
    isTransfer: t.isTransfer,
    isCcPayment: t.isCcPayment,
  };
  return {
    id: t.id,
    date: t.date.toISOString(),
    name: t.name,
    merchant,
    rawMerchant: t.merchantName,
    account: accountLabel(t.account.name, t.account.item.institutionName),
    accountMask: t.account.mask,
    institution: t.account.item.institutionName,
    owner: t.account.owner,
    ownerLabel: ownerLabel(t.account.owner, names),
    category: effectiveCategory(fields),
    categoryDetailed: t.categoryDetailed,
    amount: t.amount,
    pending: false,
    isTransfer: t.isTransfer,
    isCcPayment: t.isCcPayment,
    internal: isInternalMove(fields),
    cardMatch: paired ? "matched" : null,
    memo: t.memo,
  };
}

function presentSaved(s: SavedRow, names: HouseholdNames): TxnRow {
  return {
    id: s.plaidTransactionId,
    date: s.date.toISOString(),
    name: s.name,
    merchant: s.merchant,
    rawMerchant: s.rawMerchant,
    account: s.accountName,
    accountMask: s.accountMask,
    institution: s.institutionName,
    owner: s.owner,
    ownerLabel: ownerLabel(s.owner, names),
    category: s.category,
    categoryDetailed: s.categoryDetailed,
    amount: s.amount,
    pending: false,
    isTransfer: s.isTransfer,
    isCcPayment: s.isCcPayment,
    internal: s.internal,
    cardMatch: s.cardMatch === "matched" ? "matched" : null,
    memo: s.memo,
  };
}

/** Live rows win while they still exist, so an edit matches the transactions table. Older copies stay when Plaid drops them. */
export async function listSavedTransactions(): Promise<TxnRow[]> {
  const saved = await prisma.savedTxn.findMany({ orderBy: { date: "desc" } });
  if (!saved.length) return [];
  const [names, flags, accounts] = await Promise.all([
    getNames(),
    loadCardPaymentFlags(),
    prisma.account.findMany({ select: { id: true, owner: true } }),
  ]);
  const ownerByAccount = new Map(accounts.map((account) => [account.id, account.owner]));
  const live = await loadPosted(
    "plaidTransactionId",
    saved.map((s) => s.plaidTransactionId),
  );
  const liveByPlaid = new Map(live.map((t) => [t.plaidTransactionId, t]));
  return saved.map((s) => {
    const t = liveByPlaid.get(s.plaidTransactionId);
    if (t) return presentLive(t, names, flags.enabled && flags.paired.has(t.id));
    return presentSaved({ ...s, owner: savedOwnerNow(s, ownerByAccount) }, names);
  });
}

/** The only delete of saved transactions. */
export async function deleteAllSavedTransactions() {
  await prisma.savedTxn.deleteMany();
}

/** Snapshots copy account owner at archive time. Reassignment has to follow or the previous person keeps the history. */
export async function retargetSavedTxnOwner(accountId: string, owner: string) {
  if (!accountId || !owner) return;
  await prisma.savedTxn.updateMany({ where: { accountId }, data: { owner } });
}

async function ensureStoredSinceColumn() {
  const cols = await prisma.$queryRaw<{ name: string }[]>`PRAGMA table_info("Household")`;
  if (!cols.some((col) => col.name === "transactionsStoredSince")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Household" ADD COLUMN "transactionsStoredSince" DATETIME`);
  }
}

function asIso(value: number | bigint | string | null | undefined) {
  if (value == null || value === "") return null;
  const ms = typeof value === "bigint" ? Number(value) : typeof value === "number" ? value : Number(value) || Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** When the current local archive started. Filled from the oldest saved row if the switch was already on. */
export async function readTransactionsStoredSince(): Promise<string | null> {
  await ensureStoredSinceColumn();
  const rows = await prisma.$queryRaw<{ stored: number | bigint | string | null; keep: number | bigint | null }[]>`
    SELECT "transactionsStoredSince" as stored, "keepTransactions" as keep
    FROM "Household" WHERE "id" = 'haus'
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.stored == null && Number(row.keep) !== 0) {
    const mins = await prisma.$queryRaw<{ t: number | bigint | null }[]>`SELECT MIN("updatedAt") as t FROM "SavedTxn"`;
    const ms = mins[0]?.t == null ? Date.now() : Number(mins[0].t);
    await prisma.$executeRaw`
      UPDATE "Household" SET "transactionsStoredSince" = ${ms}
      WHERE "id" = 'haus' AND "transactionsStoredSince" IS NULL
    `;
    return new Date(ms).toISOString();
  }
  return asIso(row.stored);
}

/** Stamp the first enable for this archive. Later syncs do not move it. */
export async function markTransactionsStoredSince() {
  await ensureStoredSinceColumn();
  const ms = Date.now();
  await prisma.$executeRaw`
    UPDATE "Household" SET "transactionsStoredSince" = ${ms}
    WHERE "id" = 'haus' AND "transactionsStoredSince" IS NULL
  `;
  return readTransactionsStoredSince();
}

export async function clearTransactionsStoredSince() {
  await ensureStoredSinceColumn();
  await prisma.$executeRaw`UPDATE "Household" SET "transactionsStoredSince" = NULL WHERE "id" = 'haus'`;
}
