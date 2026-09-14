"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { AllocationChart } from "@/components/charts";
import { ReportRange } from "@/components/chart-range";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { defaultReportWindow, inWindow, type WindowKey } from "@/lib/range";
import { formatDate } from "@/lib/format";
import { BrandLabel } from "@/components/brand-mark";
import { CategoryMerchantDialog, aggregateMerchants, type MerchantLine } from "@/components/category-merchants";
import { applyMerchantRefunds, aggregateFlows, refundPairs, type FlowRow } from "@/lib/spend-net";
import { TransactionsTable, type TxnRow } from "../transactions/table";

type RecurringRow = { label: string; amount: number; cadence: string; lastDate: string; annual: number };

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

  const sliced = useMemo(() => flows.filter((f) => inWindow(f.date, range)), [flows, range]);
  const netted = useMemo(() => applyMerchantRefunds(sliced), [sliced]);
  const agg = useMemo(() => aggregateFlows(netted), [netted]);
  const pairs = useMemo(() => refundPairs(sliced), [sliced]);
  const applied = pairs.reduce((s, p) => s + p.applied, 0);
  const spendMerch: MerchantLine[] = netted
    .filter((f) => f.kind === "spend")
    .map((f) => ({ category: f.category, merchant: f.merchant, amount: f.amount }));
  const spendTotal = agg.spendRows.reduce((s, r) => s + r.value, 0);
  const activity = useMemo(
    () => txns.filter((t) => inWindow(t.date, range)),
    [txns, range],
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="mix">Mix</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="refunds">Refunds</TabsTrigger>
          </TabsList>
        </Tabs>
        <ReportRange value={range} onChange={setRange} />
      </div>

      {tab === "mix" ? (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">Spending</div>
              <div className="text-3xl font-medium font-mono tabular-nums">
                <Money value={spendTotal} />
              </div>
            </div>
            <button
              type="button"
              className="cursor-pointer text-left text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setTab("refunds")}
            >
              Merchant refunds netted
              <span className="mt-0.5 block font-mono tabular-nums text-xs">
                {pairs.length} · <Money value={applied} className="text-xs" />
              </span>
            </button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>By category</CardTitle>
            </CardHeader>
            <CardContent>
              <AllocationChart
                data={agg.spendRows.map((r) => ({ key: r.label, value: r.value }))}
                large
                showPercent
                onSliceClick={(label) =>
                  setPopup({ title: label, lines: aggregateMerchants(spendMerch, label) })
                }
              />
            </CardContent>
          </Card>
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
            {recurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Need at least three similar charges at a weekly, monthly, or annual cadence to infer a bill.
              </p>
            ) : (
              recurring.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
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
                    <div className="text-[11px] text-muted-foreground">
                      <Money value={r.annual} className="text-[11px]" /> / yr
                    </div>
                  </div>
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
                    <div className="font-mono tabular-nums">
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
    </>
  );
}
