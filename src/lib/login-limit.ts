/**
 * Wrong-passphrase limits for the household lock. Anyone on the home network can reach the lock screen,
 * so guesses are capped per address, and for everyone together because the address header can be forged.
 */
export const LOGIN_WINDOW_MS = 15 * 60_000;
export const LOGIN_LOCK_MS = 15 * 60_000;
export const MISSES_PER_ADDRESS = 5;
export const MISSES_OVERALL = 30;
const ALL = "*";

type Entry = { misses: number[]; lockedUntil: number };
export type LoginLimits = Map<string, Entry>;

export function createLoginLimits(): LoginLimits {
  return new Map();
}

function entry(limits: LoginLimits, key: string, now: number) {
  const found = limits.get(key) ?? { misses: [], lockedUntil: 0 };
  found.misses = found.misses.filter((t) => now - t < LOGIN_WINDOW_MS);
  limits.set(key, found);
  return found;
}

/** Milliseconds until this address may try again, or 0 when it may try now. */
export function loginWait(limits: LoginLimits, address: string, now = Date.now()) {
  const wait = Math.max(entry(limits, address, now).lockedUntil, entry(limits, ALL, now).lockedUntil) - now;
  return wait > 0 ? wait : 0;
}

export function recordMiss(limits: LoginLimits, address: string, now = Date.now()) {
  for (const [key, cap] of [
    [address, MISSES_PER_ADDRESS],
    [ALL, MISSES_OVERALL],
  ] as const) {
    const e = entry(limits, key, now);
    e.misses.push(now);
    if (e.misses.length >= cap) {
      e.lockedUntil = now + LOGIN_LOCK_MS;
      e.misses = [];
    }
  }
}

/** A correct passphrase clears that address's misses; the household-wide count still runs out on its own. */
export function recordSuccess(limits: LoginLimits, address: string) {
  limits.delete(address);
}

export function waitMessage(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `Too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/** The visitor's address as Next passes it on. The first entry is the original client. */
export function requestAddress(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
