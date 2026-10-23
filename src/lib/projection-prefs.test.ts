import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Two planner saves each read the stored JSON and write their own field back. Overlapping, the
// later write used to replace the whole blob with a copy that never saw the earlier field.
test("overlapping planner saves keep every field", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "haus-prefs-"));
  const env = { ...process.env, DATABASE_URL: `file:${path.join(dir, "dev.db")}` };
  execFileSync(
    process.execPath,
    [path.join(root, "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate", "--accept-data-loss"],
    { cwd: root, env, stdio: "pipe" },
  );
  const script = path.join(dir, "check.mts");
  const prefs = pathToFileURL(path.join(root, "src/lib/projection-prefs.ts")).href;
  const db = pathToFileURL(path.join(root, "src/lib/db.ts")).href;
  writeFileSync(
    script,
    `
import assert from "node:assert/strict";
import { prisma } from ${JSON.stringify(db)};
import { readProjectionPrefs, writeProjectionPrefs } from ${JSON.stringify(prefs)};

await prisma.household.create({ data: { id: "haus", nameA: "One", nameB: "" } });
await writeProjectionPrefs({ retireAgeA: 55 });
await Promise.all([
  writeProjectionPrefs({ retireAge: 60 }),
  writeProjectionPrefs({ inflation: 4 }),
  writeProjectionPrefs({ annualSpend: 80000 }),
]);
await Promise.all([
  writeProjectionPrefs({ retireAgeA: null }),
  writeProjectionPrefs({ yearsFallback: 10 }),
]);
const stored = await readProjectionPrefs();
assert.equal(stored.retireAge, 60);
assert.equal(stored.inflation, 4);
assert.equal(stored.annualSpend, 80000);
assert.equal(stored.yearsFallback, 10);
assert.equal(stored.retireAgeA, undefined);
await prisma.$disconnect();
`,
  );
  execFileSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), script], {
    cwd: root,
    env,
    stdio: "inherit",
  });
});
