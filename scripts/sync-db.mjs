// The committed migrations lag prisma/schema.prisma, so `migrate deploy` on a new
// machine leaves out tables and columns the app reads on startup.
// This adds what is missing. It does not pass --accept-data-loss: a change that
// would drop a table or column stops the build instead of deleting saved data.
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules", "prisma", "build", "index.js"), "db", "push", "--skip-generate"],
  { cwd: root, stdio: "inherit", env: process.env },
);
if (result.status !== 0) process.exit(result.status ?? 1);
