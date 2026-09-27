import { execFileSync } from "node:child_process";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let input = {};
try {
  input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
} catch {
  input = {};
}

const command = String(input.command ?? "").replace(/\s+/g, " ");

function blocked(cmd) {
  if (/\bnpm\s+run\s+dev\b/.test(cmd)) return true;
  if (/\bnpx\s+next\s+dev\b/.test(cmd)) return true;
  if (/(^|[;&|]\s*)next\s+dev\b/.test(cmd)) return true;
  return false;
}

function portOpen(port) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell",
        ["-NoProfile", "-Command", `(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Measure-Object).Count`],
        { encoding: "utf8", timeout: 8000 },
      );
      return Number(out.trim()) > 0;
    }
    execFileSync("sh", ["-c", `ss -lnt "sport = :${port}" | grep -q ":${port}"`], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

if (!blocked(command)) {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
  process.exit(0);
}

const up = portOpen(3000);
const reason = up
  ? "Port 3000 is already serving Haus. Use that server. Do not start another next dev."
  : "Do not start next dev. Ask Aurin to run npm run dev in their PowerShell, then use localhost:3000.";

process.stdout.write(
  JSON.stringify({
    permission: "deny",
    agent_message: reason,
    user_message: reason,
  }),
);
