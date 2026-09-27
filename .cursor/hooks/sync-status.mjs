import { execFileSync } from "node:child_process";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

function finish(payload) {
  process.stdout.write(JSON.stringify(payload));
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    cwd: process.cwd(),
    timeout: 20000,
  }).trim();
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

  let behind = "unknown";
  let ahead = "unknown";
  try {
    const counts = git(["rev-list", "--left-right", "--count", "HEAD...origin/master"]);
    const [left, right] = counts.split(/\s+/);
    ahead = left;
    behind = right;
  } catch {
    behind = "unknown";
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
  finish({ additional_context: lines.join("\n") });
} catch {
  finish({});
}
