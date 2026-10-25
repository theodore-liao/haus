// `prisma generate` writes the client, then renames a temp file over the query
// engine. Windows refuses that rename while the running app has the engine
// loaded. The engine binary only changes with the Prisma version, so when the
// temp file matches the engine already on disk the build can keep it.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const clientDir = path.join(root, "node_modules", ".prisma", "client");
const engineName = "query_engine-windows.dll.node";
const engine = path.join(clientDir, engineName);

function digest(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function tempFiles() {
  if (!fs.existsSync(clientDir)) return [];
  return fs.readdirSync(clientDir).filter((name) => name.startsWith(`${engineName}.tmp`));
}

/** Delete temp engines that match the one already on disk. True if a different one is still there. */
function removeMatchingTemps() {
  if (!fs.existsSync(engine)) return tempFiles().length > 0;
  const current = digest(engine);
  let different = false;
  for (const name of tempFiles()) {
    const file = path.join(clientDir, name);
    if (digest(file) === current) fs.rmSync(file, { force: true });
    else different = true;
  }
  return different;
}

const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules", "prisma", "build", "index.js"), "generate"],
  { cwd: root, encoding: "utf8", env: process.env },
);
const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const locked =
  process.platform === "win32" &&
  result.status !== 0 &&
  output.includes("EPERM") &&
  output.includes(engineName) &&
  fs.existsSync(engine);

if (result.error) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  console.error(result.error.message);
  process.exit(1);
}
if (!locked) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}
if (result.status === 0) {
  removeMatchingTemps();
  process.exit(0);
}
if (!locked) process.exit(result.status ?? 1);

if (removeMatchingTemps()) {
  console.error("Stop the running app and run the build again. A new Prisma query engine is ready, but the running app still has the old one open.");
  process.exit(result.status ?? 1);
}
console.warn("The running app has the Prisma query engine open. It matches the one just generated, so the build is keeping it.");
