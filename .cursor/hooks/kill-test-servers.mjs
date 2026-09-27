import { execFileSync } from "node:child_process";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

function finish(payload) {
  process.stdout.write(JSON.stringify(payload));
}

function pidsOnTestPorts() {
  if (process.platform === "win32") {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -ge 3001 -and $_.LocalPort -le 3009 } | Select-Object -ExpandProperty OwningProcess -Unique",
      ],
      { encoding: "utf8", timeout: 8000 },
    );
    return out
      .split(/\s+/)
      .map((s) => Number(s))
      .filter((n) => n > 0);
  }
  const out = execFileSync("sh", ["-c", "ss -lntp 2>/dev/null | awk '$4 ~ /:(300[1-9])$/ { print }'"], {
    encoding: "utf8",
    timeout: 8000,
  });
  const pids = new Set();
  for (const m of out.matchAll(/pid=(\d+)/g)) pids.add(Number(m[1]));
  return [...pids];
}

try {
  const pids = pidsOnTestPorts();
  for (const pid of pids) {
    try {
      if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
} catch {
  /* fail open */
}
finish({});
