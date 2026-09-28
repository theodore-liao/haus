"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ChartCard } from "@/components/chart-card";
import { NetWorthChart } from "@/components/charts";
import { Money } from "@/components/money";
import { formatPct } from "@/lib/format";
import { CONCENTRATION_FLAG } from "@/lib/constants";
import { concentrated, dividendSummary } from "@/lib/portfolio";
import type { HoldingRow } from "@/components/holdings-table";
import type { ValuePoint } from "@/lib/history";

type DividendTxn = { date: string; type: string; subtype: string | null; name: string; amount: number };

/** Cards under the Stocks summary: a concentration note, value over time, and dividends. */
export function StocksOverview({
  rows,
  path,
  dividends,
}: {
  rows: HoldingRow[];
  path: ValuePoint[];
  dividends: DividendTxn[];
}) {
  const material = rows.filter((r) => Math.abs(r.value) >= 10);
  const heavy = concentrated(material);
  const value = material.reduce((s, r) => s + r.value, 0);
  const div = dividendSummary(dividends, value);
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
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard kicker="Value">
          <NetWorthChart
            data={path.map((p) => ({ date: p.date, netWorth: p.value }))}
            name="Value"
            zeroBased={false}
            empty="Value history appears after the first brokerage sync."
          />
        </ChartCard>
        <ChartCard kicker="Dividends">
          <div className="text-xs text-muted-foreground">Last 12 months</div>
          <div className="display-number">
            <Money value={div.trailing} />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">This year</dt>
              <dd>
                <Money value={div.ytd} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Yield on today&apos;s value</dt>
              <dd className="num">{div.yieldPct != null ? formatPct(div.yieldPct, 2, false) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Payments</dt>
              <dd className="num">{div.count}</dd>
            </div>
          </dl>
          {div.count === 0 ? <p className="footnote mt-4">No dividends in the last 12 months.</p> : null}
        </ChartCard>
      </div>
    </>
  );
}
