"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money, Delta } from "@/components/money";
import { CashflowSankey, FROM_SAVINGS, OTHER_CATEGORIES, TO_INVESTMENTS, TO_SAVINGS } from "@/components/charts";
import { formatPct } from "@/lib/format";
import { ReportRange } from "@/components/chart-range";
import { defaultReportWindow, inWindow, ymKey, asLocalDate, type WindowKey } from "@/lib/range";
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
  const savings = incomeAll - spendAll - agg.invest;

  const spendMerch: MerchantLine[] = netted
    .filter((f) => f.kind === "spend")
    .map((f) => ({ category: f.category, merchant: f.merchant, amount: f.amount }));
  const incomeMerch: MerchantLine[] = netted
    .filter((f) => f.kind === "income")
    .map((f) => ({ category: f.category, merchant: f.merchant, amount: f.amount }));
  const investMerch: MerchantLine[] = sliced
    .filter((f) => f.kind === "invest")
    .map((f) => ({ category: f.category, merchant: f.merchant, amount: f.amount }));

  const months = useMemo(() => {
    const byMonth: Record<string, { income: number; spend: number }> = {};
    const dates = flows.map((f) => f.date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    if (!minDate || !maxDate) return [];
    const firstFull = minDate.slice(0, 7);
    const now = new Date();
    const currentYm = ymKey(now);
    let min: string | null = null;
    let max: string | null = null;
    for (const f of flows) {
      const row = byMonth[f.month] ?? { income: 0, spend: 0 };
      if (f.kind === "spend") row.spend += f.amount;
      else if (f.kind === "income") row.income += f.amount;
      byMonth[f.month] = row;
      if (!min || f.month < min) min = f.month;
      if (!max || f.month > max) max = f.month;
    }
    if (!min || !max) return [];
    const out: { month: string; label: string; income: number; spend: number; savings: number }[] = [];
    const [ys, ms] = min.split("-").map(Number);
    const [ye, me] = max.split("-").map(Number);
    let y = ye;
    let m = me;
    while (y > ys || (y === ys && m >= ms)) {
      const month = `${y}-${String(m).padStart(2, "0")}`;
      const partial = month === currentYm || month === firstFull;
      if (!partial) {
        const v = byMonth[month] ?? { income: 0, spend: 0 };
        out.push({
          month,
          label: format(asLocalDate(`${month}-01`), "MMM yyyy"),
          income: v.income,
          spend: v.spend,
          savings: v.income - v.spend,
        });
      }
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return out;
  }, [flows]);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <ReportRange value={range} onChange={setRange} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Income" value={incomeAll} />
        <Stat label="Spending" value={spendAll} />
        <Card>
          <CardHeader>
            <CardTitle>Savings rate</CardTitle>
          </CardHeader>
          <CardContent
            className={cn(
              "text-xl font-medium font-mono tabular-nums",
              incomeAll > 0 && savings > 0 && "text-positive",
              incomeAll > 0 && savings < 0 && "text-negative",
            )}
          >
            {incomeAll > 0 ? formatPct((savings / incomeAll) * 100, 0, true) : "—"}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Where money moves</CardTitle>
          <Delta value={savings} className="text-lg" />
        </CardHeader>
        <CardContent>
          <CashflowSankey
            income={agg.incomeRows}
            spend={agg.spendRows}
            invest={agg.invest}
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
              if (kind === "to-investments") {
                setPopup({ title: TO_INVESTMENTS, lines: investMerch });
              } else if (kind === "from-savings") {
                setPopup({
                  title: FROM_SAVINGS,
                  note: "Spending exceeded income in this window.",
                  lines: agg.spendRows.map((r) => ({ category: r.label, merchant: r.label, amount: r.value })),
                });
              } else {
                setPopup({
                  title: TO_SAVINGS,
                  note: "Income left after spending and investment transfers.",
                  lines: agg.incomeRows.map((r) => ({ category: r.label, merchant: r.label, amount: r.value })),
                });
              }
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Month by month</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-[min(24rem,calc(100dvh-18rem))] overflow-y-auto overscroll-contain">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-5 py-2 text-left font-medium">Month</th>
                  <th className="px-5 py-2 text-right font-medium">Income</th>
                  <th className="px-5 py-2 text-right font-medium">Spend</th>
                  <th className="px-5 py-2 text-right font-medium">Saved</th>
                  <th className="px-5 py-2 text-right font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {months.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                      No full months yet.
                    </td>
                  </tr>
                ) : (
                  months.map((m) => (
                    <tr key={m.month} className="border-b border-border last:border-0">
                      <td className="px-5 py-2">{m.label}</td>
                      <td className="px-5 py-2 text-right">
                        <Money value={m.income} />
                      </td>
                      <td className="px-5 py-2 text-right">
                        <Money value={m.spend} />
                      </td>
                      <td className="px-5 py-2 text-right">
                        <Money value={m.savings} signed />
                      </td>
                      <td className="px-5 py-2 text-right font-mono tabular-nums">
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
    </div>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-xl font-medium">
        <Money value={value} />
      </CardContent>
    </Card>
  );
}
