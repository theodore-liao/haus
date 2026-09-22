import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { HAUS_CATEGORIES } from "./categories";
import { ensureHousehold, prisma } from "./db";
import { applyMerchantRefunds, aggregateFlows, type FlowRow } from "./spend-net";
import { inWindow } from "./range";
import type { BudgetRow } from "./budget-window";

export type { BudgetRow };

const SKIP = new Set(["Income", "Transfer"]);

function spendLabels(flows: FlowRow[]) {
  const labels = new Set<string>();
  for (const c of HAUS_CATEGORIES) {
    if (c.code === "INCOME" || c.code === "TRANSFER") continue;
    labels.add(c.label);
  }
  for (const f of flows) {
    if (f.kind === "spend" && f.category && !SKIP.has(f.category)) labels.add(f.category);
  }
  return labels;
}

/** Monthly amount for every spend category: trailing 3-month net spend, divided by 3. */
export function budgetAverages(flows: FlowRow[]): BudgetRow[] {
  const labels = spendLabels(flows);
  const sliced = flows.filter((f) => inWindow(f.date, "3m"));
  const totals = new Map(
    aggregateFlows(applyMerchantRefunds(sliced)).spendRows.map((r) => [r.label, r.value]),
  );
  return [...labels]
    .map((category) => ({
      category,
      monthly: Math.max(0, Math.round((totals.get(category) ?? 0) / 3)),
    }))
    .sort((a, b) => b.monthly - a.monthly || a.category.localeCompare(b.category));
}

export function spendMonthCount(flows: FlowRow[]) {
  const months = new Set(flows.filter((f) => f.kind === "spend").map((f) => f.month));
  return Math.max(1, months.size);
}

async function ensureBudgetStore() {
  await ensureHousehold();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CategoryBudget" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "category" TEXT NOT NULL,
      "monthly" REAL NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "CategoryBudget_category_key" ON "CategoryBudget"("category")`,
  );
  const cols = await prisma.$queryRaw<{ name: string }[]>`PRAGMA table_info("Household")`;
  if (!cols.some((col) => col.name === "budgetsSeeded")) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Household" ADD COLUMN "budgetsSeeded" BOOLEAN NOT NULL DEFAULT 0`,
    );
  }
  const named = await prisma.$queryRaw<{ category: string }[]>`
    SELECT "category" FROM "CategoryBudget" WHERE "category" IN ('General merchandise', 'Shopping')
  `;
  const hasOld = named.some((row) => row.category === "General merchandise");
  const hasNew = named.some((row) => row.category === "Shopping");
  if (hasOld && !hasNew) {
    await prisma.$executeRaw`
      UPDATE "CategoryBudget" SET "category" = 'Shopping' WHERE "category" = 'General merchandise'
    `;
  } else if (hasOld) {
    await prisma.$executeRaw`DELETE FROM "CategoryBudget" WHERE "category" = 'General merchandise'`;
  }
}

async function seeded() {
  const rows = await prisma.$queryRaw<{ budgetsSeeded: number }[]>`
    SELECT "budgetsSeeded" as budgetsSeeded FROM "Household" WHERE "id" = 'haus'
  `;
  return Number(rows[0]?.budgetsSeeded ?? 0) !== 0;
}

export async function listBudgets(): Promise<BudgetRow[]> {
  await ensureBudgetStore();
  const rows = await prisma.$queryRaw<{ category: string; monthly: number }[]>`
    SELECT "category", "monthly" FROM "CategoryBudget" ORDER BY "monthly" DESC, "category" ASC
  `;
  return rows.map((r) => ({ category: r.category, monthly: Number(r.monthly) || 0 }));
}

/** First visit fills every spend category from the 3-month average. Later edits are kept. */
export async function ensureBudgets(flows: FlowRow[]): Promise<BudgetRow[]> {
  await ensureBudgetStore();
  if (await seeded()) return listBudgets();
  const averages = budgetAverages(flows);
  if (averages.length) {
    const values = Prisma.join(
      averages.map((row) => Prisma.sql`(${randomUUID()}, ${row.category}, ${row.monthly})`),
    );
    try {
      await prisma.$executeRaw`
        INSERT OR IGNORE INTO "CategoryBudget" ("id", "category", "monthly") VALUES ${values}
      `;
    } catch {
      // A parallel load already inserted the rows.
    }
  }
  await prisma.$executeRaw`UPDATE "Household" SET "budgetsSeeded" = 1 WHERE "id" = 'haus'`;
  return listBudgets();
}

export async function setBudget(category: string, monthly: number) {
  await ensureBudgetStore();
  const name = category.trim();
  if (!name || name.length > 80 || !Number.isFinite(monthly) || monthly < 0) {
    throw new Error("Invalid budget");
  }
  const amount = Math.round(monthly * 100) / 100;
  const existing = await prisma.$queryRaw<{ category: string }[]>`
    SELECT "category" FROM "CategoryBudget" WHERE "category" = ${name}
  `;
  if (existing.length) {
    await prisma.$executeRaw`
      UPDATE "CategoryBudget"
      SET "monthly" = ${amount}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "category" = ${name}
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO "CategoryBudget" ("id", "category", "monthly")
      VALUES (${randomUUID()}, ${name}, ${amount})
    `;
  }
  return { category: name, monthly: amount };
}

export async function deleteBudget(category: string) {
  await ensureBudgetStore();
  const name = category.trim();
  if (!name) throw new Error("Invalid budget");
  await prisma.$executeRaw`DELETE FROM "CategoryBudget" WHERE "category" = ${name}`;
}
