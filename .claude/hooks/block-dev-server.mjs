// PreToolUse (Bash|PowerShell): stops Claude from starting its own next dev. Port 3000 is Aurin's server.
import { execFileSync } from "node:child_process";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let input = {};
try {
  input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
} catch {
  input = {};
}

const command = String(input.tool_input?.command ?? "").replace(/\s+/g, " ");

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

if (!blocked(command)) process.exit(0);

const reason = portOpen(3000)
  ? "Port 3000 is already serving Haus. Use that server. Do not start another next dev. For a test household use npm run demo -- full 3001."
  : "Do not start next dev. Ask Aurin to run npm run dev in their PowerShell, then use localhost:3000. For a test household use npm run demo -- full 3001.";

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  }),
);
