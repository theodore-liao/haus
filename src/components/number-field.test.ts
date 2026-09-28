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

test("pasted values that only look like numbers are refused, not misread", () => {
  assert.equal(parseTyped("1.234,56"), undefined);
  assert.equal(parseTyped("0x1F"), undefined);
  assert.equal(parseTyped("--5"), undefined);
  assert.equal(parseTyped("1,234.56"), 1234.56);
  assert.equal(parseTyped("1e5"), 100000);
});

test("what applies is what the box shows: two decimals at most", () => {
  assert.deepEqual(checkTyped("7.126", { unit: "percent" }), { ok: true, value: 7.13 });
  assert.deepEqual(checkTyped("50.004", { unit: "percent", max: 50 }), { ok: true, value: 50 });
});

test("year limits read without a thousands comma", () => {
  assert.deepEqual(checkTyped("20", { integer: true, min: 1900, grouping: false }), { ok: false, error: "Use 1900 or more." });
  assert.deepEqual(checkTyped("20", { integer: true, min: 1900 }), { ok: false, error: "Use 1,900 or more." });
});
