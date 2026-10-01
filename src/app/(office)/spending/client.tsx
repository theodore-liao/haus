"use client";

import { useEffect, useMemo, useState } from "react";
import { Money } from "@/components/money";
import { ChartCard } from "@/components/chart-card";
import { AllocationChart } from "@/components/charts";
import { ReportRange, useReportWindow } from "@/components/chart-range";
import { BudgetList } from "./budget-list";
import { budgetMonths, daysLeftInMonth, monthElapsed, type BudgetRow } from "@/lib/budget-window";
import { categoryChanges, categoryTrend } from "@/lib/spend-compare";
import { defaultTxnWindow, inWindow, type WindowKey } from "@/lib/range";
import { CategoryMerchantDialog } from "@/components/category-merchants";
import { applyMerchantRefunds, aggregateFlows, type FlowRow } from "@/lib/spend-net";
import { groupCategory } from "@/lib/category-breakdown";
import { flowAfterRevision, reviseMatching } from "@/lib/txn-revise";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RecurringBill } from "@/lib/recurring";
import { RecurringPanel } from "../transactions/recurring";
import { TransactionSheet, type TxnSave } from "../transactions/table";
import type { TxnRow } from "@/lib/txn-row";

/** Category labels treated as fixed costs; unchecked by default in the breakdown. */
const FIXED_COSTS = ["Loan payments", "Rent and utilities"];

export function SpendingClient({
  flows,
  recurring,
  removedCount,
  txns,
  budgets,
  budgetChoices,
  spendMonths,
  archiveCoversFrom,
  initialRange,
}: {
  flows: FlowRow[];
  recurring: RecurringBill[];
  /** Bills the household removed from Recurring, which Restore brings back. */
  removedCount: number;
  txns: TxnRow[];
  budgets: BudgetRow[];
  budgetChoices: BudgetRow[];
  spendMonths: number;
  /** First day stored history covers every institution; older months are only partly on file. */
  archiveCoversFrom: string | null;
  initialRange: WindowKey;
}) {
  const [tab, setTab] = useState("breakdown");
  const [range, setRange] = useReportWindow(initialRange);
  // Arriving from a Budget link (Overview, Goals): show the current month so the figures match theirs.
  useEffect(() => {
    if (window.location.hash === "#budget") setRange(defaultTxnWindow());
  }, []);
  const [popupTitle, setPopupTitle] = useState<string | null>(null);
  const [edit, setEdit] = useState<TxnRow | null>(null);
  const [liveTxns, setLiveTxns] = useState(txns);
  const [liveFlows, setLiveFlows] = useState(flows);
  // Fresh server data replaces local edits, adjusted during render rather than in an effect.
  const [seen, setSeen] = useState({ txns, flows });
  if (seen.txns !== txns || seen.flows !== flows) {
    setSeen({ txns, flows });
    setLiveTxns(txns);
    setLiveFlows(flows);
  }
  function applySave(patch: TxnSave) {
    const revised = reviseMatching(liveTxns, patch);
    setLiveTxns((prev) => prev.map((row) => revised.get(row.id) ?? row));
    setLiveFlows((prev) => prev.map((flow) => flowAfterRevision(flow, revised)));
    setEdit((cur) => (cur && revised.has(cur.id) ? revised.get(cur.id)! : cur));
  }

  const sliced = useMemo(() => liveFlows.filter((f) => inWindow(f.date, range)), [liveFlows, range]);
  const netted = useMemo(() => applyMerchantRefunds(sliced), [sliced]);
  const agg = useMemo(() => aggregateFlows(netted), [netted]);
  const spendTotal = agg.spendRows.reduce((s, r) => s + r.value, 0);
  // Fixed costs start unchecked so the ring shows what is actually steerable month to month.
  const [off, setOff] = useState<Set<string>>(() => new Set(FIXED_COSTS));
  const spendKeys = agg.spendRows.map((r) => r.label);
  const spendSel = off.size === 0 ? null : new Set(spendKeys.filter((k) => !off.has(k)));
  const shownTotal = agg.spendRows.filter((r) => !off.has(r.label)).reduce((s, r) => s + r.value, 0);
  const compare = useMemo(() => categoryChanges(liveFlows, agg.spendRows, range), [liveFlows, agg.spendRows, range]);
  const popupTrend = useMemo(
    () => (popupTitle ? categoryTrend(liveFlows, popupTitle, archiveCoversFrom) : []),
    [liveFlows, popupTitle, archiveCoversFrom],
  );
  const windowTxns = useMemo(() => liveTxns.filter((t) => inWindow(t.date, range)), [liveTxns, range]);
  const popupLines = useMemo(
    () => (popupTitle ? groupCategory(windowTxns, popupTitle) : []),
    [popupTitle, windowTxns],
  );
  return (
    <div className="page-stack">
      <div className="section-head">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "breakdown" ? <ReportRange value={range} onChange={setRange} /> : null}
      </div>

      {tab === "recurring" ? <RecurringPanel recurring={recurring} rows={liveTxns} removedCount={removedCount} /> : null}

      {tab === "breakdown" && (
        <div className="breakdown-grid grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ChartCard kicker="Spend Category">
            <div className="spend-category-total">
              <div className="display-number">
                <Money value={shownTotal} />
              </div>
              <p className="spend-category-sub">
                Total spend <Money value={spendTotal} />
              </p>
              {compare ? <p className="footnote mt-1">Changes compare with {compare.label}.</p> : null}
            </div>
            <AllocationChart
              className="donut-fixed"
              data={agg.spendRows.map((r) => ({ key: r.label, value: r.value }))}
              showPercent
              selected={spendSel}
              onToggle={(key) =>
                setOff((cur) => {
                  const next = new Set(cur);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              onSliceClick={(label) => setPopupTitle(label)}
              changes={compare?.changes ?? null}
            />
          </ChartCard>
          <BudgetList
            rows={budgets}
            choices={budgetChoices}
            spent={Object.fromEntries(agg.spendRows.map((r) => [r.label, r.value]))}
            months={budgetMonths(range, spendMonths)}
            daysLeft={daysLeftInMonth(range)}
            elapsed={monthElapsed(range)}
          />
        </div>
      )}

      <CategoryMerchantDialog
        open={popupTitle != null}
        title={popupTitle ?? ""}
        lines={popupLines}
        onClose={() => setPopupTitle(null)}
        onOpenTxn={setEdit}
        positiveAmounts
        trend={popupTrend}
      />
      <TransactionSheet row={edit} onClose={() => setEdit(null)} onSaved={applySave} />
    </div>
  );
}
