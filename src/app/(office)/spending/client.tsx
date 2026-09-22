"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { ChartCard } from "@/components/chart-card";
import { AllocationChart } from "@/components/charts";
import { ReportRange } from "@/components/chart-range";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BudgetList } from "./budget-list";
import { budgetMonths, daysLeftInMonth, type BudgetRow } from "@/lib/budget-window";
import { defaultReportWindow, inWindow, type WindowKey } from "@/lib/range";
import { formatDate } from "@/lib/format";
import { BrandLabel } from "@/components/brand-mark";
import { CategoryMerchantDialog } from "@/components/category-merchants";
import type { MerchantLine } from "@/lib/merchant-lines";
import { applyMerchantRefunds, aggregateFlows, type FlowRow } from "@/lib/spend-net";
import { effectiveCategory, isInternalMove, merchantKey, recurringMerchantKey } from "@/lib/categories";
import { categoryLabel } from "@/lib/constants";
import { TransactionSheet, TransactionsTable, type TxnSave } from "../transactions/table";
import type { TxnRow } from "@/lib/txn-row";

/** A credit that is not pay, interest, or a transfer. Listed before spend is reduced by it. */
function isRefund(t: TxnRow) {
  if (t.amount >= 0 || t.isTransfer || t.isCcPayment) return false;
  const code = (t.category ?? "").toUpperCase();
  if (code === "TRANSFER" || code === "INCOME" || code.startsWith("INCOME_")) return false;
  return true;
}

function sameRule(t: TxnRow, patch: TxnSave) {
  if (t.id === patch.id) return true;
  if (!patch.applyToMerchant) return false;
  if ((t.cardMatch === "matched") !== (patch.cardMatch === "matched")) return false;
  const bases = new Set([patch.rawMerchant, patch.name, patch.merchant].map((x) => merchantKey(x)).filter(Boolean));
  return [t.rawMerchant, t.merchant, t.name].some((x) => bases.has(merchantKey(x)));
}

function reviseTxn(t: TxnRow, patch: TxnSave): TxnRow {
  const userMerchant = patch.merchant || null;
  const userCategory = patch.category;
  const fields = {
    userCategory,
    userMerchant,
    merchantName: t.rawMerchant,
    name: t.name,
    merchant: userMerchant || t.rawMerchant || t.name,
    pairedTransfer: t.cardMatch === "matched",
    isTransfer: t.isTransfer,
    isCcPayment: t.isCcPayment,
  };
  return {
    ...t,
    merchant: fields.merchant,
    category: effectiveCategory(fields),
    internal: isInternalMove(fields),
    memo: t.id === patch.id ? patch.memo : t.memo,
  };
}

/** Same rows the transactions table stores, for one category in the open window. */
function groupCategory(txns: TxnRow[], title: string): MerchantLine[] {
  const groups = new Map<string, TxnRow[]>();
  for (const t of txns) {
    if (t.internal || t.amount <= 0) continue;
    if (categoryLabel(t.category) !== title) continue;
    const list = groups.get(t.merchant) ?? [];
    list.push(t);
    groups.set(t.merchant, list);
  }
  return [...groups.entries()].map(([merchant, rows]) => ({
    category: title,
    merchant,
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
    txns: rows,
  }));
}

type RecurringRow = { label: string; amount: number; cadence: string; lastDate: string; annual: number };

/** Category labels treated as fixed costs; unchecked by default in the breakdown. */
const FIXED_COSTS = ["Loan payments", "Rent and utilities"];

export function SpendingClient({
  flows,
  recurring,
  txns,
  budgets,
  budgetChoices,
  spendMonths,
}: {
  flows: FlowRow[];
  recurring: RecurringRow[];
  txns: TxnRow[];
  budgets: BudgetRow[];
  budgetChoices: BudgetRow[];
  spendMonths: number;
}) {
  const [range, setRange] = useState<WindowKey>(defaultReportWindow());
  const [tab, setTab] = useState("mix");
  const [popupTitle, setPopupTitle] = useState<string | null>(null);
  const [edit, setEdit] = useState<TxnRow | null>(null);
  const [liveTxns, setLiveTxns] = useState(txns);
  const [liveFlows, setLiveFlows] = useState(flows);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setLiveTxns(txns);
    setLiveFlows(flows);
  }, [txns, flows]);
  const visibleRecurring = useMemo(
    () => recurring.filter((r) => !dismissed.has(recurringMerchantKey(r.label))),
    [recurring, dismissed],
  );

  function applySave(patch: TxnSave) {
    const revised = new Map<string, TxnRow>();
    for (const row of liveTxns) {
      if (sameRule(row, patch)) revised.set(row.id, reviseTxn(row, patch));
    }
    setLiveTxns((prev) => prev.map((row) => revised.get(row.id) ?? row));
    setLiveFlows((prev) =>
      prev.map((flow) => {
        const row = flow.id ? revised.get(flow.id) : undefined;
        if (!row) return flow;
        const code = (row.category ?? "").toUpperCase();
        const spend = row.amount > 0 && !row.internal && code !== "INCOME" && !code.startsWith("INCOME_");
        return {
          ...flow,
          merchant: row.merchant,
          kind: spend ? "spend" : "income",
          category: categoryLabel(row.category),
        };
      }),
    );
    setEdit((cur) => (cur && revised.has(cur.id) ? revised.get(cur.id)! : cur));
  }

  function dismissRecurring(label: string) {
    const key = recurringMerchantKey(label);
    setDismissed((cur) => {
      const next = new Set(cur);
      next.add(key);
      return next;
    });
    void fetch("/api/merchant-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant: label, ignoreRecurring: true }),
    }).then((res) => {
      if (res.ok) return;
      throw new Error("dismiss failed");
    }).catch(() => {
      setDismissed((cur) => {
        const next = new Set(cur);
        next.delete(key);
        return next;
      });
    });
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
  const windowTxns = useMemo(() => liveTxns.filter((t) => inWindow(t.date, range)), [liveTxns, range]);
  const popupLines = useMemo(
    () => (popupTitle ? groupCategory(windowTxns, popupTitle) : []),
    [popupTitle, windowTxns],
  );
  const refunds = useMemo(
    () => windowTxns.filter((t) => !t.internal && isRefund(t)).sort((a, b) => b.date.localeCompare(a.date)),
    [windowTxns],
  );

  return (
    <div className="page-stack">
      <div className="section-head">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="mix">Breakdown</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="refunds">Refunds</TabsTrigger>
          </TabsList>
        </Tabs>
        <ReportRange value={range} onChange={setRange} />
      </div>

      {tab === "mix" ? (
        <div className="breakdown-grid grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ChartCard kicker="Spend Category">
            <div className="spend-category-total">
              <div className="display-number">
                <Money value={shownTotal} />
              </div>
              <p className="spend-category-sub">
                Total spend <Money value={spendTotal} />
              </p>
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
            />
          </ChartCard>
          <BudgetList
            rows={budgets}
            choices={budgetChoices}
            spent={Object.fromEntries(agg.spendRows.map((r) => [r.label, r.value]))}
            months={budgetMonths(range, spendMonths)}
            daysLeft={daysLeftInMonth(range)}
          />
        </div>
      ) : null}

      {tab === "recurring" ? (
        <Card>
          <CardHeader>
            <CardTitle>Recurring</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleRecurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Need at least three similar charges at a weekly, monthly, or annual cadence to infer a bill.
              </p>
            ) : (
              visibleRecurring.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 text-left"
                    onClick={() => dismissRecurring(r.label)}
                  >
                    <div className="min-w-0">
                      <BrandLabel className="min-w-0" kind="merchant" name={r.label}>
                        <span className="truncate text-sm">{r.label}</span>
                      </BrandLabel>
                      <div className="text-xs text-muted-foreground">
                        {r.cadence} · last {formatDate(r.lastDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <Money value={r.amount} className="text-sm" />
                      <div className="footnote">
                        <Money value={r.annual} /> / yr
                      </div>
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissRecurring(r.label)}
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "refunds" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Credits in this window, before they reduce spend.</p>
          {refunds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No refunds in this window.</p>
          ) : (
            <TransactionsTable rows={refunds} />
          )}
        </div>
      ) : null}

      <CategoryMerchantDialog
        open={popupTitle != null}
        title={popupTitle ?? ""}
        lines={popupLines}
        onClose={() => setPopupTitle(null)}
        onOpenTxn={setEdit}
        positiveAmounts
      />
      <TransactionSheet row={edit} onClose={() => setEdit(null)} onSaved={applySave} />
    </div>
  );
}
