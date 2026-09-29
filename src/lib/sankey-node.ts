/** Which breakdown a Sankey leaf opens. The node key keeps the two "Other" bars apart. */
export type SankeyLeafAction =
  | { type: "income"; label: string }
  | { type: "spend"; label: string }
  | { type: "balance"; kind: "from-savings" | "to-investments" };

export function sankeyLeafAction(nodeName: string, label: string): SankeyLeafAction | null {
  if (nodeName.startsWith("in:")) return { type: "income", label };
  if (nodeName.startsWith("out:")) return { type: "spend", label };
  if (nodeName === "save:from") return { type: "balance", kind: "from-savings" };
  if (nodeName === "save:invest") return { type: "balance", kind: "to-investments" };
  return null;
}

/** A flow opens the leaf at its far end. The hub and To savings stay closed. */
export function sankeyLinkAction(
  sourceName: string,
  sourceLabel: string,
  targetName: string,
  targetLabel: string,
): SankeyLeafAction | null {
  return sankeyLeafAction(targetName, targetLabel) ?? sankeyLeafAction(sourceName, sourceLabel);
}

/** Income on the left. On the right, spending plus what was saved. From savings is not part of that total. */
export function sankeySideTotals(
  nodes: { name: string }[],
  links: { source: number; target: number; value: number }[],
): { inflow: number; outflow: number } {
  let inflow = 0;
  let outflow = 0;
  for (const link of links) {
    const src = nodes[link.source]?.name ?? "";
    const tgt = nodes[link.target]?.name ?? "";
    if (src.startsWith("in:")) inflow += link.value;
    if (tgt.startsWith("out:") || tgt === "save:to" || tgt === "save:invest") outflow += link.value;
  }
  return { inflow, outflow };
}

export function sankeyShareTotal(nodeName: string, inflow: number, outflow: number): number {
  if (nodeName.startsWith("in:")) return inflow;
  if (nodeName.startsWith("out:") || nodeName.startsWith("save:")) return outflow;
  return 0;
}

/** The Other window names its side. Grouping still uses the chart label "Other". */
export function sankeyOtherTitle(kind: "income" | "spend") {
  return kind === "income" ? "Other income" : "Other spending";
}

/** One decimal share of that side. Shown on every bar, including a thin one. */
export function sankeyShareLabel(value: number, total: number): string | null {
  if (!(total > 0) || !(value > 0)) return null;
  const pct = Math.min((value / total) * 100, 100);
  return `${pct.toFixed(1)}%`;
}
