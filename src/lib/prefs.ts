// Per-browser preferences. Everything here is cosmetic and lives in localStorage; nothing touches the ledger.
import { RANGE_KEYS, type RangeKey } from "./range";

export const PREF_DEFAULT_RANGE = "haus.defaultRange";
export const PREF_PRIVACY = "haus.privacy";
export const PRIVACY_CLASS = "privacy";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function storedDefaultRange(): RangeKey | null {
  const raw = read(PREF_DEFAULT_RANGE);
  return raw && (RANGE_KEYS as readonly string[]).includes(raw) ? (raw as RangeKey) : null;
}

export function setDefaultRange(key: RangeKey | null) {
  write(PREF_DEFAULT_RANGE, key);
}

export function storedPrivacy(): boolean {
  return read(PREF_PRIVACY) === "1";
}

export function applyPrivacy(on: boolean) {
  document.documentElement.classList.toggle(PRIVACY_CLASS, on);
}

export function setPrivacy(on: boolean) {
  write(PREF_PRIVACY, on ? "1" : null);
  applyPrivacy(on);
}
