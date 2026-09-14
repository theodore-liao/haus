import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { RUN_FILE, printJson } from "./lib.mjs";

function killPid(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

if (!existsSync(RUN_FILE)) {
  printJson({ ok: true, cleaned: false, reason: "no-run-file" });
  process.exit(0);
}

let run;
try {
  run = JSON.parse(readFileSync(RUN_FILE, "utf8"));
} catch {
  unlinkSync(RUN_FILE);
  printJson({ ok: true, cleaned: false, reason: "unreadable-run-file" });
  process.exit(0);
}

if (run.startedByUs && run.pid) {
  killPid(run.pid);
}

unlinkSync(RUN_FILE);
printJson({
  ok: true,
  cleaned: Boolean(run.startedByUs && run.pid),
  reused: !run.startedByUs,
  evidenceKept: true,
});
