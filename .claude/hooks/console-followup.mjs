// Stop: if the browser console or dev server logged new errors this turn, sends Claude back once to fix them.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const consoleLog = path.join(root, ".grok", "console.jsonl");
const serverLog = path.join(root, ".next", "dev", "logs", "next-development.log");
const statePath = path.join(root, ".grok", "console-hook-state.json");

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let input = {};
try {
  input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
} catch {
  input = {};
}

let state = { consoleBytes: 0, serverBytes: 0 };
let hadState = true;
try {
  state = { ...state, ...JSON.parse(readFileSync(statePath, "utf8")) };
} catch {
  hadState = false;
}

function fileText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function takeNew(file, key) {
  const text = fileText(file);
  const size = Buffer.byteLength(text);
  if (!hadState) {
    state[key] = size;
    return "";
  }
  const start = Math.min(state[key] ?? 0, size);
  state[key] = size;
  return Buffer.from(text).subarray(start).toString("utf8");
}

const found = [];
for (const line of takeNew(consoleLog, "consoleBytes").split("\n")) {
  if (!line.trim()) continue;
  try {
    const row = JSON.parse(line);
    if (row.level !== "error" && row.level !== "warning") continue;
    // Browser extensions inject scripts that throw on their own; they are not Haus bugs.
    if (/chrome-extension:\/\//.test(row.stack ?? "")) continue;
    found.push(`${row.level} ${row.url || ""} ${row.message}`.trim().slice(0, 400));
  } catch {
    /* skip a torn line */
  }
}
for (const line of takeNew(serverLog, "serverBytes").split("\n")) {
  if (!line.includes('"level":"ERROR"') && !line.includes('"level":"WARN"')) continue;
  try {
    const row = JSON.parse(line);
    const message = String(row.message ?? "");
    if (message.includes("destination stream closed early")) continue;
    found.push(`server ${String(row.level).toLowerCase()} ${message}`.replace(/\s+/g, " ").trim().slice(0, 400));
  } catch {
    /* skip */
  }
}

try {
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state));
} catch {
  /* the follow-up still matters */
}

// Only push back once per stop, so Claude cannot loop on an error it cannot fix.
const unique = [...new Set(found)].slice(0, 8);
if (input.stop_hook_active || unique.length === 0) process.exit(0);

process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason: [
      "The app recorded console errors. Fix them and recheck the affected pages. Do not ask for the errors to be pasted again.",
      "",
      ...unique.map((line) => `- ${line}`),
      "",
      'Browser entries are in .grok/console.jsonl. Server entries are in .next/dev/logs/next-development.log. Ignore "destination stream closed early": that is Next cancelling a render because the browser moved on.',
    ].join("\n"),
  }),
);
