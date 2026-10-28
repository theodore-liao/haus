import assert from "node:assert/strict";
import test from "node:test";
import { brokerageCryptoGroupId } from "./queries";

// Seed 118893826: a household linked "Summit" and "Summit 🏠", both held by the same person.
test("brokerage crypto cards stay distinct when institution names differ only by punctuation or emoji", () => {
  const summit = brokerageCryptoGroupId("Summit", "b");
  const emoji = brokerageCryptoGroupId("Summit 🏠", "b");
  const spaced = brokerageCryptoGroupId("Summit  Bank", "b");
  const tight = brokerageCryptoGroupId("Summit Bank", "b");
  const punct = brokerageCryptoGroupId("Summit!", "b");
  const ids = [summit, emoji, spaced, tight, punct];
  assert.equal(new Set(ids).size, ids.length);
});

test("the same institution and holder keep one card, and a different holder does not share it", () => {
  assert.equal(brokerageCryptoGroupId("Summit", "b"), brokerageCryptoGroupId("summit", "b"));
  assert.notEqual(brokerageCryptoGroupId("Summit", "a"), brokerageCryptoGroupId("Summit", "b"));
  assert.notEqual(brokerageCryptoGroupId("Summit", "child:ada"), brokerageCryptoGroupId("Summit:child", "ada"));
});
