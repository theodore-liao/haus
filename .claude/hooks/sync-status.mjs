// SessionStart: tells Claude whether wip is behind origin/master (see "Sync wip with master" in CLAUDE.md).
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", cwd: root, timeout: 20000 }).trim();
}

try {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = git(["status", "--porcelain"]);
  let fetched = true;
  try {
    git(["fetch", "origin", "master"]);
  } catch {
    fetched = false;
  }
  let ahead = "unknown";
  let behind = "unknown";
  try {
    [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...origin/master"]).split(/\s+/);
  } catch {
    /* leave unknown */
  }

  const lines = [
    "Haus sync note:",
    `Branch: ${branch}. Working branch should be wip.`,
    `Uncommitted changes: ${dirty ? "yes" : "no"}.`,
    fetched
      ? `Commits on origin/master not in this branch: ${behind}. Commits on this branch not in origin/master: ${ahead}.`
      : "Could not fetch origin/master. Skip sync this session.",
    "If behind is 0, or the fetch failed, do not mention sync.",
    "If behind is greater than 0 and the tree is clean and the branch is wip, merge origin/master before other work.",
    "If the tree is dirty or the branch is not wip, do not merge. Tell Aurin in one sentence.",
  ];
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") } }));
} catch {
  /* fail open */
}
