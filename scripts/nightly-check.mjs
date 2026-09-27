// Builds a random extreme household, runs Haus against it on its own port, checks every page, then shuts the server down.
// Usage: node scripts/nightly-check.mjs [seed]
// A failing seed rebuilds the same household: node scripts/demo-seed.mjs random <seed>
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const seed = process.argv[2] ?? String(Math.floor(Math.random() * 1e9));
const port = process.env.HAUS_CHECK_PORT ?? "3009";

execFileSync(process.execPath, [path.join(root, "scripts", "demo-seed.mjs"), "random", seed], { cwd: root, stdio: "inherit" });

const server = spawn(process.execPath, [path.join(root, "scripts", "demo-server.mjs"), "random", port], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

function stopServer() {
  if (server.exitCode != null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* already gone */
    }
  } else {
    server.kill("SIGTERM");
  }
}
process.on("exit", stopServer);

let code = 1;
try {
  const deadline = Date.now() + 180000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/lock`);
      if (res.ok) {
        up = true;
        break;
      }
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!up) {
    console.error(`The test server did not start on port ${port}.\n${serverLog.slice(-2000)}`);
  } else {
    try {
      execFileSync(process.execPath, [path.join(root, "scripts", "haus-check.mjs"), "check", "--demo", "--base", `http://localhost:${port}`], { cwd: root, stdio: "inherit" });
      code = 0;
    } catch {
      code = 1;
    }
    const serverErrors = serverLog.split("\n").filter((l) => /\bError\b|Unhandled|TypeError|ReferenceError/.test(l) && !/destination stream closed early/.test(l));
    if (serverErrors.length) {
      console.log(`Server errors:\n${serverErrors.slice(0, 20).join("\n")}`);
      code = 1;
    }
  }
} finally {
  stopServer();
}
console.log(code === 0 ? `Seed ${seed}: no problems.` : `Seed ${seed}: problems found. Rebuild this household with: node scripts/demo-seed.mjs random ${seed}`);
process.exit(code);
