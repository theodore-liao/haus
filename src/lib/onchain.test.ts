import test from "node:test";
import assert from "node:assert/strict";
import { classifyAddress, hexAddressProblem } from "./onchain";

test("a short 0x string is not a wallet", () => {
  assert.equal(classifyAddress("0x1234"), null);
  assert.match(hexAddressProblem("0x1234") ?? "", /has 4 characters/);
});

test("an EVM address one character short is refused", () => {
  const short = "0x" + "a".repeat(39);
  assert.equal(classifyAddress(short), null);
  assert.match(hexAddressProblem(short) ?? "", /has 39 characters; Ethereum-style addresses have 40/);
});

test("40 hex characters is EVM and 64 is Sui", () => {
  assert.equal(classifyAddress("0x" + "A".repeat(40))?.type, "evm");
  assert.equal(classifyAddress("0x" + "b".repeat(64))?.type, "sui");
  assert.equal(hexAddressProblem("0x" + "b".repeat(64)), null);
});
