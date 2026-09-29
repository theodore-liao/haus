import assert from "node:assert/strict";
import test from "node:test";
import {
  sankeyLeafAction,
  sankeyLinkAction,
  sankeyOtherTitle,
  sankeyShareLabel,
  sankeyShareTotal,
  sankeySideTotals,
} from "./sankey-node";

test("income Other and spending Other open different breakdowns", () => {
  assert.deepEqual(sankeyLeafAction("in:Other", "Other"), { type: "income", label: "Other" });
  assert.deepEqual(sankeyLeafAction("out:Other", "Other"), { type: "spend", label: "Other" });
});

test("savings and the hub do not open a merchant breakdown", () => {
  assert.equal(sankeyLeafAction("save:to", "To savings/investments"), null);
  assert.equal(sankeyLeafAction("hub", "Income"), null);
  assert.deepEqual(sankeyLeafAction("save:from", "From savings"), { type: "balance", kind: "from-savings" });
  assert.deepEqual(sankeyLeafAction("save:invest", "To investments"), { type: "balance", kind: "to-investments" });
});

test("a flow uses the leaf at the far end, so Other on either side stays on that side", () => {
  assert.deepEqual(sankeyLinkAction("in:Other", "Other", "hub", "Income"), { type: "income", label: "Other" });
  assert.deepEqual(sankeyLinkAction("hub", "Income", "out:Other", "Other"), { type: "spend", label: "Other" });
  assert.equal(sankeyLinkAction("hub", "Income", "save:to", "To savings/investments"), null);
});

test("from savings is not part of the spending total, and shows its own share of that spending", () => {
  const nodes = [{ name: "in:Pay" }, { name: "hub" }, { name: "out:Groceries" }, { name: "save:from" }];
  const links = [
    { source: 0, target: 1, value: 500 },
    { source: 1, target: 2, value: 600 },
    { source: 1, target: 3, value: 100 },
  ];
  const totals = sankeySideTotals(nodes, links);
  assert.deepEqual(totals, { inflow: 500, outflow: 600 });
  assert.equal(sankeyShareLabel(600, sankeyShareTotal("out:Groceries", totals.inflow, totals.outflow)), "100.0%");
  assert.equal(sankeyShareLabel(100, sankeyShareTotal("save:from", totals.inflow, totals.outflow)), "16.7%");
});

test("the Other window names its side without changing the chart label", () => {
  assert.equal(sankeyOtherTitle("income"), "Other income");
  assert.equal(sankeyOtherTitle("spend"), "Other spending");
});

test("share keeps one decimal", () => {
  assert.equal(sankeyShareLabel(25, 100), "25.0%");
  assert.equal(sankeyShareLabel(0.2, 100), "0.2%");
  assert.equal(sankeyShareLabel(10, 0), null);
});
