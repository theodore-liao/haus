import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createLoginLimits,
  LOGIN_LOCK_MS,
  LOGIN_WINDOW_MS,
  loginWait,
  MISSES_OVERALL,
  MISSES_PER_ADDRESS,
  recordMiss,
  recordSuccess,
  requestAddress,
  waitMessage,
} from "./login-limit";

test("an address is locked out after too many wrong passphrases, then may try again", () => {
  const limits = createLoginLimits();
  const now = 1_000_000;
  for (let i = 0; i < MISSES_PER_ADDRESS - 1; i++) recordMiss(limits, "10.0.0.5", now);
  assert.equal(loginWait(limits, "10.0.0.5", now), 0);
  recordMiss(limits, "10.0.0.5", now);
  assert.equal(loginWait(limits, "10.0.0.5", now), LOGIN_LOCK_MS);
  assert.equal(loginWait(limits, "10.0.0.9", now), 0);
  assert.equal(loginWait(limits, "10.0.0.5", now + LOGIN_LOCK_MS), 0);
});

test("misses spread out past the window do not add up", () => {
  const limits = createLoginLimits();
  for (let i = 0; i < MISSES_PER_ADDRESS * 2; i++) recordMiss(limits, "10.0.0.5", i * LOGIN_WINDOW_MS);
  assert.equal(loginWait(limits, "10.0.0.5", MISSES_PER_ADDRESS * 2 * LOGIN_WINDOW_MS), 0);
});

test("the right passphrase clears that address's misses", () => {
  const limits = createLoginLimits();
  for (let i = 0; i < MISSES_PER_ADDRESS - 1; i++) recordMiss(limits, "10.0.0.5", 0);
  recordSuccess(limits, "10.0.0.5");
  recordMiss(limits, "10.0.0.5", 0);
  assert.equal(loginWait(limits, "10.0.0.5", 0), 0);
});

test("guesses from many made-up addresses still hit the household-wide cap", () => {
  const limits = createLoginLimits();
  for (let i = 0; i < MISSES_OVERALL; i++) recordMiss(limits, `forged-${i}`, 0);
  assert.equal(loginWait(limits, "10.0.0.2", 0), LOGIN_LOCK_MS);
});

test("the wait reads in whole minutes", () => {
  assert.equal(waitMessage(LOGIN_LOCK_MS), "Too many wrong tries. Try again in 15 minutes.");
  assert.equal(waitMessage(5_000), "Too many wrong tries. Try again in 1 minute.");
});

test("the visitor address is the first forwarded entry", () => {
  assert.equal(requestAddress(new Headers({ "x-forwarded-for": "10.0.0.191, 127.0.0.1" })), "10.0.0.191");
  assert.equal(requestAddress(new Headers()), "unknown");
  assert.equal(requestAddress(new Headers({ "x-forwarded-for": `${"a".repeat(500)}, 127.0.0.1` })).length, 200);
});

test("a lock check does not store new addresses, and expired ones are dropped", () => {
  const limits = createLoginLimits();
  for (let i = 0; i < MISSES_OVERALL; i++) recordMiss(limits, `forged-${i}`, 0);
  const afterCap = limits.size;
  for (let i = 0; i < 100; i++) assert.equal(loginWait(limits, `look-${i}`, 0), LOGIN_LOCK_MS);
  assert.equal(limits.size, afterCap);
  const later = LOGIN_LOCK_MS + LOGIN_WINDOW_MS;
  recordMiss(limits, "10.0.0.2", later);
  assert.ok(limits.size < afterCap);
  assert.equal(limits.has("10.0.0.2"), true);
  assert.equal(limits.has("forged-0"), false);
  assert.equal(loginWait(limits, "10.0.0.2", later), 0);
});
