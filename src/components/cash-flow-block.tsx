"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { kickerClass } from "@/components/type";
import { Pill } from "@/components/pills";
import { ChartCard } from "@/components/chart-card";
import { CashflowSankey, SavingsRateTrend } from "@/components/charts";
import { FROM_SAVINGS, TO_INVESTMENTS } from "@/lib/flow-labels";
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
import { groupIncomeNode, groupInvestNode, groupSpendNode } from "@/lib/category-breakdown";
import type { MerchantLine } from "@/lib/merchant-lines";
import { applyMerchantRefunds, aggregateFlows, type FlowRow } from "@/lib/spend-net";
import { withComparisons } from "@/lib/cashflow-months";
import { flowAfterRevision, reviseMatching } from "@/lib/txn-revise";
import type { TxnRow } from "@/lib/txn-row";
import { TransactionSheet, type TxnSave } from "@/app/(office)/transactions/table";

type Popup =
  | { kind: "spend" | "income"; title: string }
  | { kind: "invest" }
  | { kind: "from-savings" };

export function CashFlowBlock({
  flows,
  txns,
  archiveCoversFrom = null,
  between,
  budget,
}: {
  flows: FlowRow[];
  txns: TxnRow[];
  /** First day the saved archive covers every institution. Older months before this are incomplete. */
  archiveCoversFrom?: string | null;
  /** Rendered between the cashflow card and the month-by-month row (net worth and allocation). */
  between?: ReactNode;
  /** Budget card, shown beside the month-by-month card. */
  budget?: ReactNode;
}) {
  const [range, setRange] = useState<WindowKey>(defaultReportWindow());
  const [popup, setPopup] = useState<Popup | null>(null);
  const [edit, setEdit] = useState<TxnRow | null>(null);
  const [liveTxns, setLiveTxns] = useState(txns);
  const [liveFlows, setLiveFlows] = useState(flows);
  useEffect(() => {
    setLiveTxns(txns);
    setLiveFlows(flows);
  }, [txns, flows]);

  function applySave(patch: TxnSave) {
    const revised = reviseMatching(liveTxns, patch);
    setLiveTxns((prev) => prev.map((row) => revised.get(row.id) ?? row));
    setLiveFlows((prev) => prev.map((flow) => flowAfterRevision(flow, revised)));
    setEdit((cur) => (cur && revised.has(cur.id) ? revised.get(cur.id)! : cur));
  }

  const sliced = useMemo(() => liveFlows.filter((f) => inWindow(f.date, range)), [liveFlows, range]);
  const netted = useMemo(() => applyMerchantRefunds(sliced), [sliced]);
  const agg = useMemo(() => aggregateFlows(netted), [netted]);
  const spendAll = agg.spendRows.reduce((s, r) => s + r.value, 0);
  const incomeAll = agg.incomeRows.reduce((s, r) => s + r.value, 0);
  const savings = incomeAll - spendAll;

  const windowTxns = useMemo(() => liveTxns.filter((t) => inWindow(t.date, range)), [liveTxns, range]);
  const popupLines = useMemo((): MerchantLine[] => {
    if (!popup) return [];
    if (popup.kind === "from-savings") {
      return agg.spendRows.map((r) => ({ category: r.label, merchant: r.label, amount: r.value }));
    }
    if (popup.kind === "invest") return groupInvestNode(windowTxns, netted);
    if (popup.kind === "income") return groupIncomeNode(windowTxns, netted, agg.incomeRows, popup.title);
    return groupSpendNode(windowTxns, netted, agg.spendRows, popup.title);
  }, [popup, windowTxns, netted, agg]);
  const popupTitle =
    popup?.kind === "from-savings" ? FROM_SAVINGS : popup?.kind === "invest" ? TO_INVESTMENTS : (popup?.title ?? "");

  // The latest three months always show. Older months appear only when the saved archive
  // covers that month from the first day, so a fresh ~90-day pull does not pad the table.
  const months = useMemo(() => {
    const byMonth: Record<string, { income: number; spend: number }> = {};
    for (const f of liveFlows) {
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
  }, [liveFlows, archiveCoversFrom]);

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
            onSpendClick={(label) => setPopup({ kind: "spend", title: label })}
            onIncomeClick={(label) => setPopup({ kind: "income", title: label })}
            onBalanceClick={(kind) => {
              if (kind === "to-investments") setPopup({ kind: "invest" });
              else if (kind === "from-savings") setPopup({ kind: "from-savings" });
            }}
          />
      </ChartCard>
      {between}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
      <div className="relative min-w-0">{budget}</div>
      <Card className="flex min-w-0 flex-col">
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
          <div className="max-h-[min(24rem,calc(100dvh-18rem))] soft-scroll">
            <table className="data-table">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className={cn("border-b border-border", kickerClass)}>
                  <th>Month</th>
                  {/* Phones keep Month, Spend, and Saved so the table fits without scrolling sideways. */}
                  <th className="num hidden xl:table-cell">Income</th>
                  <th className="num">Spend</th>
                  {showYoy ? <th className="num hidden 2xl:table-cell">Spend vs last year</th> : null}
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
                      <td className="num hidden xl:table-cell">
                        <Money value={m.income} />
                      </td>
                      <td className="num">
                        <Money value={m.spend} />
                      </td>
                      {showYoy ? (
                        <td
                          className={cn(
                            "num hidden 2xl:table-cell",
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
      </div>
      <CategoryMerchantDialog
        open={popup != null}
        title={popupTitle}
        lines={popupLines}
        note={popup?.kind === "from-savings" ? "Spending exceeded income in this window." : undefined}
        onClose={() => setPopup(null)}
        onOpenTxn={popup?.kind === "from-savings" ? undefined : setEdit}
        positiveAmounts={popup?.kind !== "from-savings"}
      />
      <TransactionSheet row={edit} onClose={() => setEdit(null)} onSaved={applySave} />
    </section>
  );
}
