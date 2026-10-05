import assert from "node:assert/strict";
import { test } from "node:test";
import { hasSpouse, ownerLabel, ownerOptions } from "./owners";

const solo = { nameA: "Alex Rivera", nameB: "", children: [] };
const pair = { nameA: "Alex Rivera", nameB: "Sam Rivera", children: [] };

test("blank or default second name means no spouse", () => {
  assert.equal(hasSpouse(solo), false);
  assert.equal(hasSpouse({ nameB: "Two" }), false);
  assert.equal(hasSpouse({ nameB: "  " }), false);
  assert.equal(hasSpouse(pair), true);
});

test("no spouse drops Spouse and Joint choices", () => {
  assert.deepEqual(ownerOptions(solo).map((o) => o.value), ["a"]);
  assert.deepEqual(ownerOptions(pair).map((o) => o.value), ["a", "b", "joint"]);
  assert.ok(ownerOptions(solo, "b").some((o) => o.value === "b"));
});

test("no spouse: joint shows the primary, spouse-owned money stays labelled", () => {
  assert.equal(ownerLabel("joint", solo), "Alex");
  assert.equal(ownerLabel("b", solo), "Second person");
  assert.equal(ownerLabel("joint", pair), "Joint");
});
