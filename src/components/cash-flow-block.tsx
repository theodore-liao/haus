"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { ObjectTitle, kickerClass } from "@/components/type";
import { Pills, Pill } from "@/components/pills";
import { ChartCard } from "@/components/chart-card";
import { CashflowSankey, FROM_SAVINGS, OTHER_CATEGORIES } from "@/components/charts";
import { formatPct } from "@/lib/format";
import { ReportRange } from "@/components/chart-range";
import { defaultReportWindow, inWindow, asLocalDate, ymKey, type WindowKey } from "@/lib/range";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { CategoryMerchantDialog, aggregateMerchants, type MerchantLine } from "@/components/category-merchants";
import { applyMerchantRefunds, aggregateFlows, type FlowRow } from "@/lib/spend-net";

export function CashFlowBlock({ flows }: { flows: FlowRow[] }) {
  const [range, setRange] = useState<WindowKey>(defaultReportWindow());
  const [popup, setPopup] = useState<{ title: string; lines: MerchantLine[]; note?: string } | null>(null);

  const sliced = useMemo(() => flows.filter((f) => inWindow(f.date, range)), [flows, range]);
  const netted = useMemo(() => applyMerchantRefunds(sliced), [sliced]);
  const agg = useMemo(() => aggregateFlows(netted), [netted]);
  const spendAll = agg.spendRows.reduce((s, r) => s + r.value, 0);
  const incomeAll = agg.incomeRows.reduce((s, r) => s + r.value, 0);
  const savings = incomeAll - spendAll;

  const spendMerch: MerchantLine[] = netted
    .filter((f) => f.kind === "spend")
    .map((f) => ({ category: f.category, merchant: f.merchant, amount: f.amount }));
  const incomeMerch: MerchantLine[] = netted
    .filter((f) => f.kind === "income")
    .map((f) => ({ category: f.category, merchant: f.merchant, amount: f.amount }));

  const months = useMemo(() => {
    const byMonth: Record<string, { income: number; spend: number }> = {};
    for (const f of flows) {
      const row = byMonth[f.month] ?? { income: 0, spend: 0 };
      if (f.kind === "spend") row.spend += f.amount;
      else if (f.kind === "income") row.income += f.amount;
      byMonth[f.month] = row;
    }
    const now = new Date();
    const keys = [0, 1, 2].map((i) => ymKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    return keys.map((month) => {
      const v = byMonth[month] ?? { income: 0, spend: 0 };
      return {
        month,
        label: format(asLocalDate(`${month}-01`), "MMM yyyy"),
        income: v.income,
        spend: v.spend,
        savings: v.income - v.spend,
      };
    });
  }, [flows]);

  return (
    <section className="page-stack pt-2">
      <div className="section-head">
        <ObjectTitle>Cashflow</ObjectTitle>
        <ReportRange value={range} onChange={setRange} />
      </div>
      <Pills>
        <Pill kicker="Income" accent="#7EABD4">
          <Money value={incomeAll} />
        </Pill>
        <Pill kicker="Spending" accent="#D4928C">
          <Money value={spendAll} />
        </Pill>
        <Pill kicker="Net Movement" accent="#7DB8A4">
          <Money value={savings} signed />
        </Pill>
      </Pills>
      <ChartCard kicker="Where money moves">
          <CashflowSankey
            income={agg.incomeRows}
            spend={agg.spendRows}
            onSpendClick={(label) =>
              setPopup({
                title: label,
                lines:
                  label === OTHER_CATEGORIES
                    ? leftover(spendMerch, agg.spendRows, 8)
                    : aggregateMerchants(spendMerch, label),
              })
            }
            onIncomeClick={(label) =>
              setPopup({
                title: label,
                lines:
                  label === OTHER_CATEGORIES
                    ? leftover(incomeMerch, agg.incomeRows, 6)
                    : aggregateMerchants(incomeMerch, label),
              })
            }
            onBalanceClick={(kind) => {
              if (kind !== "from-savings") return;
              setPopup({
                title: FROM_SAVINGS,
                note: "Spending exceeded income in this window.",
                lines: agg.spendRows.map((r) => ({ category: r.label, merchant: r.label, amount: r.value })),
              });
            }}
          />
      </ChartCard>
      <Card>
        <CardHeader>
          <CardTitle>Month by month</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-[min(24rem,calc(100dvh-18rem))] overflow-y-auto overscroll-contain">
            <table className="data-table">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className={cn("border-b border-border", kickerClass)}>
                  <th>Month</th>
                  <th className="num">Income</th>
                  <th className="num">Spend</th>
                  <th className="num">Saved</th>
                  {/* Rate is derivable from Saved/Income; phones drop it so the table fits without scrolling. */}
                  <th className="num hidden sm:table-cell">Rate</th>
                </tr>
              </thead>
              <tbody>
                {months.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No full months yet.
                    </td>
                  </tr>
                ) : (
                  months.map((m) => (
                    <tr key={m.month} className="border-b border-border last:border-0">
                      <td>{m.label}</td>
                      <td className="num">
                        <Money value={m.income} />
                      </td>
                      <td className="num">
                        <Money value={m.spend} />
                      </td>
                      <td className="num">
                        <Money value={m.savings} signed />
                      </td>
                      <td className="num hidden text-muted-foreground sm:table-cell">
                        {m.income > 0 ? formatPct((m.savings / m.income) * 100, 0, true) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <CategoryMerchantDialog
        open={popup != null}
        title={popup?.title ?? ""}
        lines={popup?.lines ?? []}
        note={popup?.note}
        onClose={() => setPopup(null)}
      />
    </section>
  );
}

function leftover(lines: MerchantLine[], ranked: { label: string }[], keep: number): MerchantLine[] {
  const top = new Set(ranked.slice(0, keep).map((r) => r.label));
  const rest = new Set(ranked.filter((r) => !top.has(r.label)).map((r) => r.label));
  const map: Record<string, number> = {};
  for (const l of lines) {
    if (!rest.has(l.category)) continue;
    map[l.merchant] = (map[l.merchant] ?? 0) + l.amount;
  }
  return Object.entries(map).map(([merchant, amount]) => ({
    category: OTHER_CATEGORIES,
    merchant,
    amount,
  }));
}


