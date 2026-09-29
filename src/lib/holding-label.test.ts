import assert from "node:assert/strict";
import test from "node:test";
import { holdingLabel } from "./holding-label";

test("a real ticker shows as itself, a plan's fund id shows the fund's name, cash shows as Cash", () => {
  assert.equal(holdingLabel({ symbol: "QQQM", name: "Invesco NASDAQ 100 ETF" }), "QQQM");
  assert.equal(holdingLabel({ symbol: "BRK.B", name: "Berkshire Hathaway" }), "BRK.B");
  assert.equal(holdingLabel({ symbol: "MRMSPI", name: "S&P 500 Index Fund" }), "S&P 500 Index Fund");
  assert.equal(holdingLabel({ symbol: "VANG.500.INDEX.TRUST", name: "Vang 500 Index Trust" }), "Vang 500 Index Trust");
  assert.equal(holdingLabel({ symbol: "CUR:USD", name: "U S Dollar" }), "Cash");
  assert.equal(holdingLabel({ symbol: null, name: "Cash" }), "Cash");
});
