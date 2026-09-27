// Runs Haus against a test household on its own port and build folder, leaving the real server on 3000 alone.
// Usage: node scripts/demo-server.mjs [full|single|empty] [port]
import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const profile = process.argv[2] ?? "full";
const port = process.argv[3] ?? "3001";
if (port === "3000") {
  console.error("Port 3000 belongs to the real Haus server. Pick another port.");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
if (!existsSync(path.join(root, "prisma", `demo-${profile}.db`))) {
  execFileSync(process.execPath, [path.join(root, "scripts", "demo-seed.mjs"), profile], { cwd: root, stdio: "inherit" });
}

const DEMO_PASSWORD = "demo-household";

const child = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", port], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: `file:./demo-${profile}.db`,
    HAUS_DIST_DIR: `.next-demo-${profile}`,
    HAUS_SITE_PASSWORD: DEMO_PASSWORD,
    HAUS_SESSION_SECRET: "demo-session-secret-not-for-real-use-000000",
    HAUS_TOKEN_KEY: "demo-token-key-not-for-real-use",
    ALLOWED_EMAILS: "",
    HAUS_PUBLIC_URL: "",
    PLAID_CLIENT_ID: "",
    PLAID_SECRET: "",
    PLAID_ENV: "sandbox",
    FINNHUB_API_KEY: "",
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
