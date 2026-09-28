"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { ChartCard } from "@/components/chart-card";
import { AllocationChart } from "@/components/charts";
import { Chip, ChipGroup, ReportRange } from "@/components/chart-range";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmButton } from "@/components/confirm-button";
import { BudgetList } from "./budget-list";
import { budgetMonths, daysLeftInMonth, monthElapsed, type BudgetRow } from "@/lib/budget-window";
import { categoryChanges, categoryTrend } from "@/lib/spend-compare";
import type { RecurringBill } from "@/lib/recurring";
import { Pill } from "@/components/pills";
import { cn } from "@/lib/utils";
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

/** Category labels treated as fixed costs; unchecked by default in the breakdown. */
const FIXED_COSTS = ["Loan payments", "Rent and utilities"];

export function SpendingClient({
  flows,
  recurring,
  txns,
  budgets,
  budgetChoices,
  spendMonths,
  archiveCoversFrom,
}: {
  flows: FlowRow[];
  recurring: RecurringBill[];
  txns: TxnRow[];
  budgets: BudgetRow[];
  budgetChoices: BudgetRow[];
  spendMonths: number;
  /** First day stored history covers every institution; older months are only partly on file. */
  archiveCoversFrom: string | null;
}) {
  const [range, setRange] = useState<WindowKey>(defaultReportWindow());
  const [tab, setTab] = useState("mix");
  const [popupTitle, setPopupTitle] = useState<string | null>(null);
  const [edit, setEdit] = useState<TxnRow | null>(null);
  const [liveTxns, setLiveTxns] = useState(txns);
  const [liveFlows, setLiveFlows] = useState(flows);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [billSort, setBillSort] = useState<"amount" | "next">("amount");
  useEffect(() => {
    setLiveTxns(txns);
    setLiveFlows(flows);
  }, [txns, flows]);
  const visibleRecurring = useMemo(() => {
    const list = recurring.filter((r) => !dismissed.has(recurringMerchantKey(r.label)));
    return billSort === "next"
      ? [...list].sort((a, b) => a.nextDate.localeCompare(b.nextDate))
      : [...list].sort((a, b) => b.annual - a.annual);
  }, [recurring, dismissed, billSort]);
  const billTotals = useMemo(
    () => ({
      monthly: visibleRecurring.reduce((s, r) => s + r.monthly, 0),
      annual: visibleRecurring.reduce((s, r) => s + r.annual, 0),
      changed: visibleRecurring.filter((r) => r.priceChange).length,
    }),
    [visibleRecurring],
  );
  const today = new Date().toISOString().slice(0, 10);

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
      ) : null}

      {tab === "recurring" ? (
        <Card>
          <CardHeader row>
            <CardTitle>Recurring</CardTitle>
            {visibleRecurring.length > 1 ? (
              <ChipGroup>
                <Chip active={billSort === "amount"} onClick={() => setBillSort("amount")}>
                  Amount
                </Chip>
                <Chip active={billSort === "next"} onClick={() => setBillSort("next")}>
                  Next due
                </Chip>
              </ChipGroup>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleRecurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Need at least three similar charges at a weekly, monthly, or annual cadence to infer a bill.
              </p>
            ) : (
              <>
                <div className="pills pills-compact pills-trio mb-2">
                  <Pill kicker="Per month" accent="#D4928C">
                    <Money value={billTotals.monthly} />
                  </Pill>
                  <Pill kicker="Per year" accent="#7EABD4">
                    <Money value={billTotals.annual} />
                  </Pill>
                  <Pill kicker="Price changes" accent="#D4BE7A">
                    <span className={cn("num", billTotals.changed > 0 && "text-accent")}>{billTotals.changed}</span>
                  </Pill>
                </div>
                {visibleRecurring.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <BrandLabel className="min-w-0 max-w-full" kind="merchant" name={r.label}>
                          <span className="truncate text-sm">{r.label}</span>
                        </BrandLabel>
                        <div className="text-xs text-muted-foreground">
                          {r.cadence} · {r.nextDate.slice(0, 10) < today ? "was due" : "next"} {formatDate(r.nextDate)}
                          {r.priceChange ? (
                            <span className={r.priceChange.to > r.priceChange.from ? "text-negative" : "text-positive"}>
                              {" · "}
                              {r.priceChange.to > r.priceChange.from ? "up" : "down"} from <Money value={r.priceChange.from} />
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Money value={r.amount} className="text-sm" />
                        <div className="footnote whitespace-nowrap">
                          <Money value={r.annual} /> / yr
                        </div>
                      </div>
                    </div>
                    <ConfirmButton
                      title={`Remove ${r.label} from Recurring?`}
                      description="It stops being listed as a bill. Its transactions stay."
                      onConfirm={() => dismissRecurring(r.label)}
                      ariaLabel={`Remove ${r.label}`}
                      className="shrink-0 px-2 sm:px-3"
                    >
                      <X className="sm:hidden" />
                      <span className="hidden sm:inline">Remove</span>
                    </ConfirmButton>
                  </div>
                ))}
              </>
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
        trend={popupTrend}
      />
      <TransactionSheet row={edit} onClose={() => setEdit(null)} onSaved={applySave} />
    </div>
  );
}
