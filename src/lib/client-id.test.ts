import { test } from "node:test";
import assert from "node:assert/strict";
import { clientId } from "./client-id";

test("ids work where the browser has no randomUUID (plain HTTP at home)", () => {
  const original = globalThis.crypto.randomUUID;
  Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
  try {
    const a = clientId();
    const b = clientId();
    assert.match(a, /^[0-9a-f]{24}$/);
    assert.notEqual(a, b);
  } finally {
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: original, configurable: true });
  }
});
