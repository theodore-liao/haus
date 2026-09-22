"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { HeroCard } from "@/components/hero-card";
import { ChartCard } from "@/components/chart-card";
import { AllocationChart } from "@/components/charts";
import { ReportRange } from "@/components/chart-range";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { defaultReportWindow, inWindow, type WindowKey } from "@/lib/range";
import { formatDate } from "@/lib/format";
import { BrandLabel } from "@/components/brand-mark";
import { CategoryMerchantDialog, aggregateMerchants, type MerchantLine } from "@/components/category-merchants";
import { applyMerchantRefunds, aggregateFlows, refundPairs, type FlowRow } from "@/lib/spend-net";
import { recurringMerchantKey } from "@/lib/categories";
import { TransactionsTable, type TxnRow } from "../transactions/table";

type RecurringRow = { label: string; amount: number; cadence: string; lastDate: string; annual: number };

/** Category labels treated as fixed costs; unchecked by default in the breakdown. */
const FIXED_COSTS = ["Loan payments", "Rent and utilities"];

export function SpendingClient({
  flows,
  recurring,
  txns,
}: {
  flows: FlowRow[];
  recurring: RecurringRow[];
  txns: TxnRow[];
}) {
  const [range, setRange] = useState<WindowKey>(defaultReportWindow());
  const [tab, setTab] = useState("mix");
  const [popup, setPopup] = useState<{ title: string; lines: MerchantLine[] } | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const visibleRecurring = useMemo(
    () => recurring.filter((r) => !dismissed.has(recurringMerchantKey(r.label))),
    [recurring, dismissed],
  );

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

  const sliced = useMemo(() => flows.filter((f) => inWindow(f.date, range)), [flows, range]);
  const netted = useMemo(() => applyMerchantRefunds(sliced), [sliced]);
  const agg = useMemo(() => aggregateFlows(netted), [netted]);
  const pairs = useMemo(() => refundPairs(sliced), [sliced]);
  const spendMerch: MerchantLine[] = netted
    .filter((f) => f.kind === "spend")
    .map((f) => ({ category: f.category, merchant: f.merchant, amount: f.amount }));
  const spendTotal = agg.spendRows.reduce((s, r) => s + r.value, 0);
  // Fixed costs start unchecked so the ring shows what is actually steerable month to month.
  const [off, setOff] = useState<Set<string>>(() => new Set(FIXED_COSTS));
  const spendKeys = agg.spendRows.map((r) => r.label);
  const spendSel = off.size === 0 ? null : new Set(spendKeys.filter((k) => !off.has(k)));
  const shownTotal = agg.spendRows.filter((r) => !off.has(r.label)).reduce((s, r) => s + r.value, 0);
  const activity = useMemo(
    () => txns.filter((t) => inWindow(t.date, range)),
    [txns, range],
  );

  return (
    <div className="page-stack">
      <div className="section-head">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="mix">Breakdown</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="refunds">Refunds</TabsTrigger>
          </TabsList>
        </Tabs>
        <ReportRange value={range} onChange={setRange} />
      </div>

      {tab === "mix" ? (
        <>
          <HeroCard
            kicker="Spending"
            supporting={
              <>
                Total spend <Money value={spendTotal} />
              </>
            }
          >
            <Money value={shownTotal} />
          </HeroCard>
          <ChartCard kicker="By category">
            <AllocationChart
              data={agg.spendRows.map((r) => ({ key: r.label, value: r.value }))}
              showPercent
              size="large"
              selected={spendSel}
              onToggle={(key) =>
                setOff((cur) => {
                  const next = new Set(cur);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              onSliceClick={(label) =>
                setPopup({ title: label, lines: aggregateMerchants(spendMerch, label) })
              }
            />
          </ChartCard>
        </>
      ) : null}

      {tab === "activity" ? (
        <TransactionsTable rows={activity} />
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
        <Card>
          <CardHeader>
            <CardTitle>Merchant refunds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Credits from a merchant that also has spend in this window. Applied amount never exceeds spend (nothing goes
              below zero). Extra credit stays here, not on income.
            </p>
            {pairs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No merchant credits to net in this window.</p>
            ) : (
              pairs.map((p) => (
                <div key={p.merchant} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                  <BrandLabel kind="merchant" name={p.merchant}>
                    <span className="text-sm">{p.merchant}</span>
                  </BrandLabel>
                  <div className="text-right text-sm">
                    <div className="num">
                      −<Money value={p.applied} className="text-sm" />
                    </div>
                    {p.leftover > 0.005 ? (
                      <div className="text-xs text-muted-foreground">
                        extra <Money value={p.leftover} className="text-xs" />
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      <CategoryMerchantDialog
        open={popup != null}
        title={popup?.title ?? ""}
        lines={popup?.lines ?? []}
        onClose={() => setPopup(null)}
      />
    </div>
  );
}
