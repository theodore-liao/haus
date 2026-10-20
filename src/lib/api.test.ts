import assert from "node:assert/strict";
import test from "node:test";
import { bodyId, calendarDay, isMissingRow, readJson, updateOrGone } from "./api";
import { isCalendarDay, localDayKey } from "./range";

const post = (body: string) => new Request("http://haus.test/api", { method: "POST", body });

test("a body that isn't JSON reads as null instead of throwing", async () => {
  assert.equal(await readJson(post("{oops")), null);
  assert.equal(await readJson(post("")), null);
  assert.deepEqual(await readJson(post('{"id":"a"}')), { id: "a" });
  assert.equal(await readJson(post("null")), null);
});

test("an id is a non-empty string, whatever else was sent", () => {
  assert.equal(bodyId({ id: "abc" }), "abc");
  for (const body of [null, undefined, 42, "abc", [], {}, { id: "" }, { id: "  " }, { id: 7 }, { id: ["a"] }]) {
    assert.equal(bodyId(body), null, JSON.stringify(body));
  }
});

test("a row that is already gone answers 404, and any other failure still throws", async () => {
  const gone = Object.assign(new Error("No record was found for an update."), { code: "P2025" });
  assert.equal(isMissingRow(gone), true);
  assert.equal(isMissingRow(new Error("disk full")), false);
  assert.equal(isMissingRow(null), false);
  const answer = await updateOrGone(() => Promise.reject(gone));
  assert.ok(answer instanceof Response);
  assert.equal(answer.status, 404);
  assert.equal(await updateOrGone(() => Promise.resolve("saved")), "saved");
  await assert.rejects(() => updateOrGone(() => Promise.reject(new Error("disk full"))), /disk full/);
});

test("only real calendar days pass as dates", () => {
  for (const day of ["2026-02-28", "2028-02-29", "1900-01-01", "2026-12-31"]) assert.equal(isCalendarDay(day), true, day);
  for (const day of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-1-5", "soon", "", "2026-10-20T00:00:00Z"]) {
    assert.equal(isCalendarDay(day), false, day);
  }
  assert.equal(calendarDay.safeParse("2026-02-30").success, false);
  assert.equal(calendarDay.safeParse("2026-10-20").success, true);
});

test("today is the local calendar day, not the UTC one", () => {
  // 9pm on 20 October where Haus runs is still the 20th, even where UTC has moved on to the 21st.
  assert.equal(localDayKey(new Date(2026, 9, 20, 21, 30)), "2026-10-20");
  assert.equal(localDayKey(new Date(2026, 0, 5, 0, 5)), "2026-01-05");
});
