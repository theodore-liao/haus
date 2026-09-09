import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
const dest = join(root, "backups", stamp);
mkdirSync(dest, { recursive: true });

const db = join(root, "prisma", "dev.db");
if (existsSync(db)) {
  cpSync(db, join(dest, "dev.db"));
}

const wal = join(root, "prisma", "dev.db-wal");
if (existsSync(wal)) cpSync(wal, join(dest, "dev.db-wal"));
const shm = join(root, "prisma", "dev.db-shm");
if (existsSync(shm)) cpSync(shm, join(dest, "dev.db-shm"));

const insurance = join(root, "data", "insurance");
if (existsSync(insurance)) {
  cpSync(insurance, join(dest, "insurance"), { recursive: true });
}

console.log(`Backup written to ${dest}`);
console.log("Keep this folder off GitHub. Copy it to another drive periodically.");
