import assert from "node:assert/strict";
import test from "node:test";
import { DUST_USD, isDust } from "./dust";

test("entries under a dollar are dust, either sign", () => {
  assert.equal(isDust(0.4), true);
  assert.equal(isDust(-0.4), true);
  assert.equal(isDust(0), true);
  assert.equal(isDust(DUST_USD), false);
  assert.equal(isDust(25), false);
  assert.equal(isDust(null), false);
});
