import assert from "node:assert/strict";
import test from "node:test";
import { inOrder } from "./in-order";

test("jobs run one at a time, and a failure does not drop the next", async () => {
  const run = inOrder();
  const order: string[] = [];
  let release: () => void = () => {};
  const first = run(async () => {
    order.push("start1");
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    order.push("end1");
    throw new Error("nope");
  });
  const second = run(async () => {
    order.push("start2");
    return "ok";
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["start1"]);
  release();
  await assert.rejects(first);
  assert.equal(await second, "ok");
  assert.deepEqual(order, ["start1", "end1", "start2"]);
});
