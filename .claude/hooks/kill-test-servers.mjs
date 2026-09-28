// Stop: kills test servers on 3001-3009, unless a background reviewer still needs them.
// Touch .grok/keep-servers before launching a background ux-critic; it counts for an hour, and removing it ends the hold.
import { statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

try {
  const age = Date.now() - statSync(path.join(root, ".grok", "keep-servers")).mtimeMs;
  if (age < 60 * 60 * 1000) process.exit(0);
} catch {
  /* no hold */
}

await import(new URL("../../.cursor/hooks/kill-test-servers.mjs", import.meta.url).href);
