import assert from "node:assert/strict";
import test from "node:test";
import { linkExitLogLine, linkExitMessage } from "./plaid-link-error";

test("closing Link without an error shows nothing", () => {
  assert.equal(linkExitMessage(null, "Some Bank"), null);
});

test("Plaid's own wording comes first, with the institution and code", () => {
  assert.equal(
    linkExitMessage(
      { error_code: "INSTITUTION_NOT_RESPONDING", error_message: "internal detail", display_message: "The bank is not responding." },
      "Some Bank",
    ),
    "Some Bank: The bank is not responding. (INSTITUTION_NOT_RESPONDING)",
  );
});

test("falls back to the developer message, then to a plain line", () => {
  assert.equal(linkExitMessage({ error_code: "X", error_message: "raw" }), "raw (X)");
  assert.equal(linkExitMessage({}), "Plaid couldn’t finish connecting.");
});

test("the log line keeps identifiers and drops empty fields", () => {
  const line = linkExitLogLine({
    error: { error_code: "OAUTH_ERROR", error_type: "INSTITUTION_ERROR", error_message: "line one\nline two" },
    institution: "Some Bank",
    linkSessionId: "abc",
  });
  assert.equal(
    line,
    '[plaid link] code="OAUTH_ERROR" type="INSTITUTION_ERROR" institution="Some Bank" link_session_id="abc" message="line one line two"',
  );
});
