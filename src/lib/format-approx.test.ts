import { test } from "node:test";
import assert from "node:assert/strict";
import { formatApprox } from "./format";

test("projections round to what they can honestly claim", () => {
  assert.equal(formatApprox(2_481_150), "$2.48M");
  assert.equal(formatApprox(12_345_678), "$12.3M");
  assert.equal(formatApprox(482_371.4), "$482,400");
  assert.equal(formatApprox(49_107.46), "$49,100");
  assert.equal(formatApprox(4_092.29), "$4,090");
  assert.equal(formatApprox(-23_598.78), "-$23,600");
  assert.equal(formatApprox(null), "—");
});

test("a person's own figure shows whole dollars", async () => {
  const { formatWhole, roundApprox } = await import("./format");
  assert.equal(formatWhole(40_171.4), "$40,171");
  assert.equal(roundApprox(247_345), 247_300);
});
