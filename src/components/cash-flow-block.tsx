"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { kickerClass } from "@/components/type";
import { Pill } from "@/components/pills";
import { ChartCard } from "@/components/chart-card";
import { CashflowSankey, SavingsRateTrend } from "@/components/charts";
import { OTHER_CATEGORIES, TO_INVESTMENTS } from "@/lib/flow-labels";
import { sankeyOtherTitle } from "@/lib/sankey-node";
import { otherCategoryLabels, SANKEY_INCOME_LIMIT, SANKEY_SPEND_LIMIT } from "@/lib/sankey-slices";
import { formatPct } from "@/lib/format";
import { ReportRange, useReportWindow } from "@/components/chart-range";
import {
  asLocalDate,
  cashflowTableMonths,
  defaultTxnWindow,
  inWindow,
  type WindowKey,
} from "@/lib/range";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useScrollFits } from "@/lib/use-scroll-fits";
import { CategoryMerchantDialog } from "@/components/category-merchants";
import { groupCategory, groupIncomeNode, groupInvestNode, groupSpendNode } from "@/lib/category-breakdown";
import { categoryTrend } from "@/lib/spend-compare";
import { OpenCategoryContext } from "@/components/open-category";
import type { MerchantLine } from "@/lib/merchant-lines";
import { applyMerchantRefunds, aggregateFlows, type FlowRow } from "@/lib/spend-net";
import { withComparisons } from "@/lib/cashflow-months";
import { flowAfterRevision, reviseMatching } from "@/lib/txn-revise";
import type { TxnRow } from "@/lib/txn-row";
import { TransactionSheet, type TxnSave } from "@/app/(office)/transactions/table";

type Popup =
  | { kind: "spend" | "income"; title: string }
  | { kind: "invest" }
  /** A Budget card row. It covers the open month, which is what that card measures, not the cashflow chip. */
  | { kind: "budget"; title: string };

export function CashFlowBlock({
  flows,
  txns,
  archiveCoversFrom = null,
  initialRange,
  between,
  budget,
}: {
  flows: FlowRow[];
  txns: TxnRow[];
  /** First day the saved archive covers every institution. Older months before this are incomplete. */
  archiveCoversFrom?: string | null;
  /** Month the date chips open on. */
  initialRange: WindowKey;
  /** Rendered between the cashflow card and the month-by-month row (net worth and allocation). */
  between?: ReactNode;
  /** Budget card, shown beside the month-by-month card. */
  budget?: ReactNode;
}) {
  const [range, setRange] = useReportWindow(initialRange);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [chartsEl, setChartsEl] = useState<HTMLDivElement | null>(null);
  const [chartsH, setChartsH] = useState<number | null>(null);
  const [monthsBox, setMonthsBox] = useState<HTMLDivElement | null>(null);
  const monthsFit = useScrollFits(monthsBox);
  const [moreBelow, setMoreBelow] = useState(false);
  const measureMonths = useCallback(() => {
    if (monthsBox) setMoreBelow(monthsBox.scrollHeight - monthsBox.scrollTop - monthsBox.clientHeight > 4);
  }, [monthsBox]);
  const [edit, setEdit] = useState<TxnRow | null>(null);
  const [liveTxns, setLiveTxns] = useState(txns);
  const [liveFlows, setLiveFlows] = useState(flows);
  useEffect(() => {
    setLiveTxns(txns);
    setLiveFlows(flows);
  }, [txns, flows]);
  useLayoutEffect(() => {
    if (!chartsEl) return;
    const measure = () => {
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      setChartsH(wide ? Math.round(chartsEl.getBoundingClientRect().height) : null);
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(chartsEl);
    const mq = window.matchMedia("(min-width: 1024px)");
    mq.addEventListener("change", measure);
    return () => {
      watcher.disconnect();
      mq.removeEventListener("change", measure);
    };
  }, [chartsEl]);

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
  const openBudgetCategory = useCallback((title: string) => setPopup({ kind: "budget", title }), []);
  const popupLines = useMemo((): MerchantLine[] => {
    if (!popup) return [];
    if (popup.kind === "budget") {
      const month = defaultTxnWindow();
      return groupCategory(
        liveTxns.filter((t) => inWindow(t.date, month)),
        popup.title,
      );
    }
    if (popup.kind === "invest") return groupInvestNode(windowTxns, netted);
    if (popup.kind === "income") return groupIncomeNode(windowTxns, netted, agg.incomeRows, popup.title);
    return groupSpendNode(windowTxns, netted, agg.spendRows, popup.title);
  }, [popup, liveTxns, windowTxns, netted, agg]);
  const popupTrend = useMemo(
    () => (popup?.kind === "budget" ? categoryTrend(liveFlows, popup.title, archiveCoversFrom) : []),
    [popup, liveFlows, archiveCoversFrom],
  );
  const popupTitle =
    popup?.kind === "invest"
      ? TO_INVESTMENTS
      : popup && (popup.kind === "income" || popup.kind === "spend") && popup.title === OTHER_CATEGORIES
        ? sankeyOtherTitle(popup.kind)
        : (popup?.title ?? "");
  const otherNote =
    popup && (popup.kind === "income" || popup.kind === "spend") && popup.title === OTHER_CATEGORIES
      ? otherCategoryLabels(
          popup.kind === "income" ? agg.incomeRows : agg.spendRows,
          popup.kind === "income" ? SANKEY_INCOME_LIMIT : SANKEY_SPEND_LIMIT,
        ).join(", ")
      : undefined;

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
  useEffect(() => {
    if (!monthsBox) return;
    measureMonths();
    const watcher = new ResizeObserver(measureMonths);
    watcher.observe(monthsBox);
    for (const child of monthsBox.children) watcher.observe(child);
    return () => watcher.disconnect();
  }, [monthsBox, measureMonths, monthsWithRate.length]);
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
            }}
          />
      </ChartCard>
      <div ref={setChartsEl}>{between}</div>
      <div className="overview-split" style={chartsH != null ? ({ "--overview-row": `${chartsH}px` } as CSSProperties) : undefined}>
      <div className="overview-budget min-w-0">
        <OpenCategoryContext.Provider value={openBudgetCategory}>{budget}</OpenCategoryContext.Provider>
      </div>
      <div className="overview-months min-w-0">
      <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <CardHeader>
          <CardTitle>Month by month</CardTitle>
        </CardHeader>
        {trend.length >= 3 ? (
          <div className="shrink-0 px-[var(--space-card)] pb-3">
            <div className="footnote mb-1">Savings rate</div>
            <SavingsRateTrend data={trend} />
          </div>
        ) : null}
        <CardContent className="relative flex min-h-0 flex-1 flex-col px-0 pb-0">
          <div
            ref={setMonthsBox}
            onScroll={measureMonths}
            data-scroll-fits={monthsFit || undefined}
            className="month-scroll soft-scroll min-h-0 flex-1"
          >
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
                        {m.rate != null ? formatPct(m.rate * 100, 0) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!monthsFit && moreBelow ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
              style={{ background: "linear-gradient(to top, var(--card), transparent)" }}
            />
          ) : null}
        </CardContent>
      </Card>
      </div>
      </div>
      <CategoryMerchantDialog
        open={popup != null}
        title={popupTitle}
        lines={popupLines}
        note={otherNote}
        onClose={() => setPopup(null)}
        onOpenTxn={setEdit}
        positiveAmounts
        trend={popupTrend}
      />
      <TransactionSheet row={edit} onClose={() => setEdit(null)} onSaved={applySave} />
    </section>
  );
}
