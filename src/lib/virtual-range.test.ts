import assert from "node:assert/strict";
import test from "node:test";
import { visibleSlice } from "./virtual-range";

test("a short list is drawn in full", () => {
  assert.deepEqual(visibleSlice(0, 800, 4, 40), { start: 0, end: 4 });
});

test("only the rows in view are drawn, with a margin above and below", () => {
  const { start, end } = visibleSlice(400, 200, 500, 40);
  assert.equal(start, 2);
  assert.equal(end, 23);
});

test("the last rows of a long list stay inside the slice", () => {
  const { start, end } = visibleSlice(480, 200, 20, 40);
  assert.ok(start < 19);
  assert.equal(end, 20);
});

test("scrolling past a short list draws nothing more", () => {
  assert.deepEqual(visibleSlice(9000, 400, 3, 40), { start: 3, end: 3 });
});

test("an empty list draws nothing", () => {
  assert.deepEqual(visibleSlice(0, 800, 0, 40), { start: 0, end: 0 });
});
