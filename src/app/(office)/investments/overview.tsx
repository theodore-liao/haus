"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ChartCard } from "@/components/chart-card";
import { NetWorthChart } from "@/components/charts";
import { formatPct } from "@/lib/format";
import { CONCENTRATION_FLAG } from "@/lib/constants";
import { concentrated } from "@/lib/portfolio";
import type { HoldingRow } from "@/components/holdings-table";
import type { ValuePoint } from "@/lib/history";
import type { ReactNode } from "react";

/** Concentration note, then value over time beside largest moves. By account and By class sit above this. */
export function StocksOverview({
  rows,
  path,
  moves,
}: {
  rows: HoldingRow[];
  path: ValuePoint[];
  moves: ReactNode;
}) {
  const material = rows.filter((r) => Math.abs(r.value) >= 10);
  const heavy = concentrated(material);
  return (
    <>
      {heavy.length ? (
        <Card>
          <CardContent className="flex items-start gap-2 pt-[var(--space-card)] text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0">
              <div>
                {heavy.map((p, i) => (
                  <span key={p.label}>
                    {i > 0 ? ", " : ""}
                    <span className="font-medium">{p.label}</span> is {formatPct(p.weight * 100, 0, false)}
                  </span>
                ))}{" "}
                of your stocks.
              </div>
              <div className="footnote">
                More than {Math.round(CONCENTRATION_FLAG * 100)}% in one holding ties much of the portfolio to how it does.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid items-stretch gap-4 2xl:grid-cols-2">
        <ChartCard kicker="Value">
          <NetWorthChart
            data={path.map((p) => ({ date: p.date, netWorth: p.value }))}
            name="Value"
            zeroBased={false}
            empty="Value history appears after the first brokerage sync."
          />
        </ChartCard>
        {moves}
      </div>
    </>
  );
}
