"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { kickerClass } from "@/components/type";
import { Pill } from "@/components/pills";
import { ChartCard } from "@/components/chart-card";
import { CashflowSankey, SavingsRateTrend } from "@/components/charts";
import { FROM_SAVINGS, OTHER_CATEGORIES } from "@/lib/flow-labels";
import { formatPct } from "@/lib/format";
import { ReportRange } from "@/components/chart-range";
import {
  asLocalDate,
  cashflowTableMonths,
  defaultReportWindow,
  inWindow,
  type WindowKey,
} from "@/lib/range";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { CategoryMerchantDialog } from "@/components/category-merchants";
import { aggregateMerchants, type MerchantLine } from "@/lib/merchant-lines";
import { applyMerchantRefunds, aggregateFlows, type FlowRow } from "@/lib/spend-net";
import { withComparisons } from "@/lib/cashflow-months";

export function CashFlowBlock({
  flows,
  archiveCoversFrom = null,
}: {
  flows: FlowRow[];
  /** First day the saved archive covers every institution. Older months before this are incomplete. */
  archiveCoversFrom?: string | null;
}) {
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

  // The latest three months always show. Older months appear only when the saved archive
  // covers that month from the first day, so a fresh ~90-day pull does not pad the table.
  const months = useMemo(() => {
    const byMonth: Record<string, { income: number; spend: number }> = {};
    for (const f of flows) {
      if (f.kind !== "spend" && f.kind !== "income") continue;
      const row = byMonth[f.month] ?? { income: 0, spend: 0 };
      if (f.kind === "spend") row.spend += f.amount;
      else row.income += f.amount;
      byMonth[f.month] = row;
    }
    return cashflowTableMonths(Object.keys(byMonth), archiveCoversFrom).map((month) => {
      const v = byMonth[month] ?? { income: 0, spend: 0 };
      return {
        month,
        label: format(asLocalDate(`${month}-01`), "MMM yyyy"),
        income: v.income,
        spend: v.spend,
        savings: v.income - v.spend,
      };
    });
  }, [flows, archiveCoversFrom]);

  const monthsWithRate = useMemo(() => withComparisons(months), [months]);
  const trend = useMemo(
    () =>
      [...monthsWithRate]
        .reverse()
        .filter((m) => m.rate != null)
        .map((m) => ({ label: format(asLocalDate(`${m.month}-01`), "MMM"), rate: m.rate as number })),
    [monthsWithRate],
  );
  const showYoy = monthsWithRate.some((m) => m.spendVsLastYear != null);

  return (
    <section className="page-stack pt-2">
      <ChartCard kicker="Cashflow" actions={<ReportRange value={range} onChange={setRange} />}>
        <div className="pills pills-compact pills-trio mb-4">
          <Pill kicker="Income" accent="#7EABD4">
            <Money value={incomeAll} />
          </Pill>
          <Pill kicker="Spending" accent="#D4928C">
            <Money value={spendAll} />
          </Pill>
          <Pill kicker="Net Movement" accent="#7DB8A4">
            <Money value={savings} signed />
          </Pill>
        </div>
        <div className={cn(kickerClass, "mb-2")}>Where money moves</div>
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
        {trend.length >= 3 ? (
          <div className="px-[var(--space-card)] pb-3">
            <div className="footnote mb-1">Savings rate</div>
            <SavingsRateTrend data={trend} />
          </div>
        ) : null}
        <CardContent className="px-0 pb-0">
          <div className="max-h-[min(24rem,calc(100dvh-18rem))] overflow-y-auto overscroll-contain">
            <table className="data-table">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className={cn("border-b border-border", kickerClass)}>
                  <th>Month</th>
                  {/* Phones keep Month, Spend, and Saved so the table fits without scrolling sideways. */}
                  <th className="num hidden sm:table-cell">Income</th>
                  <th className="num">Spend</th>
                  {showYoy ? <th className="num hidden md:table-cell">Spend vs last year</th> : null}
                  <th className="num">Saved</th>
                  {/* Rate is derivable from Saved/Income; phones drop it so the table fits without scrolling. */}
                  <th className="num hidden sm:table-cell">Rate</th>
                </tr>
              </thead>
              <tbody>
                {monthsWithRate.length === 0 ? (
                  <tr>
                    <td colSpan={showYoy ? 6 : 5} className="py-8 text-center text-muted-foreground">
                      No full months yet.
                    </td>
                  </tr>
                ) : (
                  monthsWithRate.map((m) => (
                    <tr key={m.month} className="border-b border-border last:border-0">
                      <td>
                        {m.label}
                        {m.current ? <span className="footnote"> · so far</span> : null}
                        {m.mark === "best" ? <span className="footnote text-positive"> · best</span> : null}
                        {m.mark === "worst" ? <span className="footnote text-negative"> · lowest</span> : null}
                      </td>
                      <td className="num hidden sm:table-cell">
                        <Money value={m.income} />
                      </td>
                      <td className="num">
                        <Money value={m.spend} />
                      </td>
                      {showYoy ? (
                        <td
                          className={cn(
                            "num hidden md:table-cell",
                            m.spendVsLastYear == null
                              ? "text-muted-foreground"
                              : m.spendVsLastYear > 0
                                ? "text-negative"
                                : "text-positive",
                          )}
                        >
                          {m.spendVsLastYear == null ? "—" : formatPct(m.spendVsLastYear * 100, 0, true)}
                        </td>
                      ) : null}
                      <td className="num">
                        <Money value={m.savings} signed />
                      </td>
                      <td className="num hidden text-muted-foreground sm:table-cell">
                        {m.rate != null ? formatPct(m.rate * 100, 0, true) : "—"}
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
