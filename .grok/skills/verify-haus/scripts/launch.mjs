import { spawn } from "node:child_process";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { BASE_URL, RUN_FILE, REPO_ROOT, ensureArtifacts, probe, printJson } from "./lib.mjs";

const existing = await probe();
if (existing.ok) {
  ensureArtifacts();
  writeFileSync(
    RUN_FILE,
    JSON.stringify({ startedByUs: false, url: BASE_URL, state: existing.state }, null, 2),
  );
  printJson({ ok: true, reused: true, ...existing });
  process.exit(0);
}

if (existing.state === "not-haus") {
  printJson({ ok: false, reused: false, ...existing, error: "port answered but is not Haus" });
  process.exit(1);
}

if (existsSync(RUN_FILE)) {
  try {
    const prev = JSON.parse(readFileSync(RUN_FILE, "utf8"));
    if (prev.startedByUs && prev.pid) {
      printJson({
        ok: false,
        error: "a previous verify-haus launch recorded a pid; run cleanup.mjs before starting another",
        pid: prev.pid,
      });
      process.exit(1);
    }
  } catch {
    /* ignore unreadable run file */
  }
}

ensureArtifacts();
const child = spawn("npm", ["run", "dev"], {
  cwd: REPO_ROOT,
  detached: true,
  stdio: "ignore",
  shell: true,
  windowsHide: true,
  env: process.env,
});
const pid = child.pid;
child.unref();
writeFileSync(
  RUN_FILE,
  JSON.stringify({ startedByUs: true, pid, url: BASE_URL }, null, 2),
);

const deadline = Date.now() + 60_000;
let last = existing;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 500));
  last = await probe();
  if (last.ok) {
    writeFileSync(
      RUN_FILE,
      JSON.stringify({ startedByUs: true, pid, url: BASE_URL, state: last.state }, null, 2),
    );
    printJson({ ok: true, reused: false, pid, ...last });
    process.exit(0);
  }
  if (last.state === "not-haus") break;
}

printJson({ ok: false, reused: false, pid, ...last, error: "Haus did not become ready on :3000" });
process.exit(1);
