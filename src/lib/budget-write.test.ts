import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Prisma's @updatedAt column is NOT NULL and has no database default. A raw insert that
// omits it fails for every household, including the first automatic budget seed.
test("a new budget saves when updatedAt has no database default", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "haus-budget-"));
  const env = { ...process.env, DATABASE_URL: `file:${path.join(dir, "dev.db")}` };
  execFileSync(
    process.execPath,
    [path.join(root, "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate", "--accept-data-loss"],
    { cwd: root, env, stdio: "pipe" },
  );
  const script = path.join(dir, "check.mts");
  writeFileSync(
    script,
    `
import { setBudget } from ${JSON.stringify(path.join(root, "src/lib/budgets.ts"))};
import { prisma } from ${JSON.stringify(path.join(root, "src/lib/db.ts"))};

const row = await setBudget("Dining", 42.5);
if (row.category !== "Dining" || row.monthly !== 42.5) throw new Error("insert");
const again = await setBudget("Dining", 10);
if (again.monthly !== 10) throw new Error("update");
const stored = await prisma.$queryRawUnsafe(
  'SELECT "updatedAt" as updatedAt, "monthly" as monthly FROM "CategoryBudget" WHERE "category" = ?',
  "Dining",
);
if (!stored[0]?.updatedAt) throw new Error("missing updatedAt");
if (Number(stored[0].monthly) !== 10) throw new Error("monthly");
await prisma.$disconnect();
`,
  );
  execFileSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), script], {
    cwd: root,
    env,
    stdio: "inherit",
  });
});
