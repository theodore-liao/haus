import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = join(SCRIPT_DIR, "..");
export const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");
export const ARTIFACTS = join(SKILL_DIR, "artifacts");
export const RUN_FILE = join(ARTIFACTS, "run.json");
export const BASE_URL = (process.env.HAUS_VERIFY_URL || "http://localhost:3000").replace(/\/$/, "");

export function ensureArtifacts() {
  mkdirSync(ARTIFACTS, { recursive: true });
}

function connRefused(err) {
  const code = err?.code || err?.cause?.code;
  return code === "ECONNREFUSED" || code === "ENOTFOUND" || err?.message?.includes("fetch failed");
}

async function readBody(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export async function probe() {
  try {
    const lockRes = await fetch(`${BASE_URL}/lock`, { redirect: "manual" });
    const lockBody = lockRes.status === 200 ? await readBody(lockRes) : "";
    if (lockRes.status === 200 && /Household lock/.test(lockBody) && /HAUS/.test(lockBody)) {
      return { ok: true, state: "lock", status: lockRes.status, url: BASE_URL };
    }
    if (lockRes.status >= 300 && lockRes.status < 400) {
      return { ok: true, state: "office", status: lockRes.status, url: BASE_URL };
    }

    const homeRes = await fetch(`${BASE_URL}/`, { redirect: "manual" });
    const loc = homeRes.headers.get("location") || "";
    const homeBody = homeRes.status === 200 ? await readBody(homeRes) : "";
    if (homeRes.status >= 300 && homeRes.status < 400 && /\/lock/.test(loc)) {
      return { ok: true, state: "lock", status: homeRes.status, url: BASE_URL };
    }
    if (homeRes.status === 200 && /Household lock/.test(homeBody)) {
      return { ok: true, state: "lock", status: homeRes.status, url: BASE_URL };
    }
    if (homeRes.status === 200 && /HAUS/.test(homeBody)) {
      return { ok: true, state: "office", status: homeRes.status, url: BASE_URL };
    }
    return { ok: false, state: "not-haus", status: homeRes.status, url: BASE_URL };
  } catch (err) {
    if (connRefused(err)) return { ok: false, state: "down", url: BASE_URL };
    return { ok: false, state: "down", url: BASE_URL };
  }
}

export function printJson(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}
