// Average cost per coin, entered by the household for wallet and brokerage crypto that has no cost of its own.
import { ensureHousehold, prisma } from "./db";

let ready: Promise<void> | null = null;

function ensureStore() {
  ready ??= (async () => {
    await ensureHousehold();
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CryptoCost" (
        "symbol" TEXT NOT NULL PRIMARY KEY,
        "avgCost" REAL NOT NULL,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export function costKey(symbol: string) {
  return symbol.trim().toUpperCase().replace(/-USD$/, "");
}

/** Average cost per coin, keyed by upper-case symbol. */
export async function listCryptoCosts(): Promise<Map<string, number>> {
  await ensureStore();
  const rows = await prisma.$queryRaw<{ symbol: string; avgCost: number }[]>`SELECT "symbol", "avgCost" FROM "CryptoCost"`;
  return new Map(rows.map((r) => [r.symbol, Number(r.avgCost)]));
}

/** Null or zero clears the coin's cost. */
export async function setCryptoCost(symbol: string, avgCost: number | null) {
  await ensureStore();
  const key = costKey(symbol);
  if (!key) return;
  if (avgCost == null || !(avgCost > 0)) {
    await prisma.$executeRaw`DELETE FROM "CryptoCost" WHERE "symbol" = ${key}`;
    return;
  }
  await prisma.$executeRaw`
    INSERT INTO "CryptoCost" ("symbol", "avgCost", "updatedAt") VALUES (${key}, ${avgCost}, CURRENT_TIMESTAMP)
    ON CONFLICT("symbol") DO UPDATE SET "avgCost" = excluded."avgCost", "updatedAt" = CURRENT_TIMESTAMP
  `;
}
