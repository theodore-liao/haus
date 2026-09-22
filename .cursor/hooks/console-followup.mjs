import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
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

function finish(payload) {
  process.stdout.write(JSON.stringify(payload));
}

if (input.status && input.status !== "completed") {
  finish({});
  process.exit(0);
}
if ((input.loop_count ?? 0) > 0) {
  finish({});
  process.exit(0);
}

let state = { consoleBytes: 0, serverBytes: 0 };
let hadState = true;
try {
  state = { ...state, ...JSON.parse(readFileSync(statePath, "utf8")) };
} catch {
  hadState = false;
}

const found = [];

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
  return text.slice(start);
}

const browser = takeNew(consoleLog, "consoleBytes");
for (const line of browser.split("\n")) {
  if (!line.trim()) continue;
  try {
    const row = JSON.parse(line);
    if (row.level !== "error" && row.level !== "warning") continue;
    found.push(`${row.level} ${row.url || ""} ${row.message}`.trim());
  } catch {
    /* skip a torn line */
  }
}

const server = takeNew(serverLog, "serverBytes");
for (const line of server.split("\n")) {
  if (!line.includes('"level":"ERROR"') && !line.includes('"level":"WARN"')) continue;
  try {
    const row = JSON.parse(line);
    const message = String(row.message ?? "");
    if (message.includes("destination stream closed early")) continue;
    if (row.level !== "ERROR" && row.level !== "WARN") continue;
    found.push(`server ${row.level.toLowerCase()} ${message}`.replace(/\s+/g, " ").trim().slice(0, 400));
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

const unique = [...new Set(found)].slice(0, 8);
if (unique.length === 0) {
  finish({});
  process.exit(0);
}

finish({
  followup_message: [
    "The app recorded console errors. Fix them and recheck the affected pages. Do not ask for the errors to be pasted again.",
    "",
    ...unique.map((line) => `- ${line}`),
    "",
    "Browser entries are in .grok/console.jsonl. Server entries are in .next/dev/logs/next-development.log. Ignore \"destination stream closed early\": that is Next cancelling a render because the browser moved on.",
  ].join("\n"),
});
