import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTyped, parseTyped } from "./number-field";

test("number fields explain what is wrong instead of using a bad value", () => {
  assert.deepEqual(checkTyped("7%", { unit: "money" }), { ok: false, error: "Enter a dollar amount." });
  assert.deepEqual(checkTyped("$7", { unit: "percent" }), { ok: false, error: "Enter a percent." });
  assert.deepEqual(checkTyped("2.5", { integer: true }), { ok: false, error: "Use a whole number." });
  assert.deepEqual(checkTyped("100", { max: 80 }), { ok: false, error: "Use 80 or less." });
  assert.deepEqual(checkTyped("", {}), { ok: false, error: "Enter a number." });
  assert.deepEqual(checkTyped("", { allowBlank: true }), { ok: true, value: null });
  assert.deepEqual(checkTyped("$1,000", { unit: "money", min: 0 }), { ok: true, value: 1000 });
});

test("number fields read what people type", () => {
  assert.equal(parseTyped("$1,000"), 1000);
  assert.equal(parseTyped("7%"), 7);
  assert.equal(parseTyped(" 12.5 "), 12.5);
  assert.equal(parseTyped("-5"), -5);
  assert.equal(parseTyped(""), null);
  assert.equal(parseTyped("   "), null);
  assert.equal(parseTyped("abc"), undefined);
  assert.equal(parseTyped("1e400"), undefined);
});
