"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { ObjectTitle, kickerClass } from "@/components/type";
import { Pills, Pill } from "@/components/pills";
import { ChartCard } from "@/components/chart-card";
import { CashflowSankey } from "@/components/charts";
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
}: {
  flows: FlowRow[];
  txns: TxnRow[];
  /** First day the saved archive covers every institution. Older months before this are incomplete. */
  archiveCoversFrom?: string | null;
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
            onSpendClick={(label) => setPopup({ kind: "spend", title: label })}
            onIncomeClick={(label) => setPopup({ kind: "income", title: label })}
            onBalanceClick={(kind) => {
              if (kind === "to-investments") setPopup({ kind: "invest" });
              else if (kind === "from-savings") setPopup({ kind: "from-savings" });
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


