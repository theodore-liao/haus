"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { AllocationChart, CashflowSankey, CategoryBars, FROM_SAVINGS, OTHER_CATEGORIES, TO_SAVINGS } from "@/components/charts";
import { formatDate } from "@/lib/format";
import { ChartRange } from "@/components/chart-range";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_RANGE, inRange, type RangeKey } from "@/lib/range";
import { formatPct } from "@/lib/format";
import { Delta } from "@/components/money";
import { cn } from "@/lib/utils";
import { CategoryMerchantDialog, aggregateMerchants, type MerchantLine } from "@/components/category-merchants";
import { BrandLabel } from "@/components/brand-mark";

type MonthRow = {
  month: string;
  income: number;
  spend: number;
  savings: number;
  cats: { key: string; label: string; value: number }[];
  incomeCats?: { label: string; value: number }[];
  merchants: { label: string; value: number }[];
  spendMerchants?: MerchantLine[];
  incomeMerchants?: MerchantLine[];
};

type RecurringRow = { label: string; amount: number; cadence: string; lastDate: string; annual: number };

export function ReportsClient({
  months,
  recurring,
}: {
  months: MonthRow[];
  recurring: RecurringRow[];
}) {
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [spendSel, setSpendSel] = useState<Set<string> | null>(null);
  const [incomeSel, setIncomeSel] = useState<Set<string> | null>(null);
  const [popup, setPopup] = useState<{ title: string; lines: MerchantLine[]; note?: string } | null>(null);

  const sliced = useMemo(
    () => months.filter((m) => inRange(`${m.month}-01`, range)),
    [months, range],
  );
  const spendCats: Record<string, number> = {};
  const incomeCats: Record<string, number> = {};
  const spendMerch: MerchantLine[] = [];
  const incomeMerch: MerchantLine[] = [];
  for (const m of sliced) {
    for (const c of m.cats) spendCats[c.label] = (spendCats[c.label] ?? 0) + c.value;
    for (const c of m.incomeCats ?? []) incomeCats[c.label] = (incomeCats[c.label] ?? 0) + c.value;
    spendMerch.push(...(m.spendMerchants ?? []));
    incomeMerch.push(...(m.incomeMerchants ?? []));
  }
  const spendRows = Object.entries(spendCats)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const incomeRows = Object.entries(incomeCats)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const spendKeys = spendRows.map((r) => r.label);
  const incomeKeys = incomeRows.map((r) => r.label);
  const spendVisible = spendSel == null ? spendRows : spendRows.filter((r) => spendSel.has(r.label));
  const incomeVisible = incomeSel == null ? incomeRows : incomeRows.filter((r) => incomeSel.has(r.label));
  const spend = spendVisible.reduce((s, r) => s + r.value, 0);
  const income = incomeVisible.reduce((s, r) => s + r.value, 0);
  const spendAll = spendRows.reduce((s, r) => s + r.value, 0);
  const incomeAll = incomeRows.reduce((s, r) => s + r.value, 0);
  const savings = incomeAll - spendAll;

  function toggle(current: Set<string> | null, key: string, allKeys: string[], set: (n: Set<string> | null) => void) {
    const base = current ?? new Set(allKeys);
    const next = new Set(base);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    set(next.size === allKeys.length ? null : next);
  }

  function leftoverMerchants(lines: MerchantLine[], ranked: { label: string }[], keep: number) {
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

  function openSpend(label: string) {
    if (label === OTHER_CATEGORIES) {
      setPopup({
        title: OTHER_CATEGORIES,
        lines: leftoverMerchants(spendMerch, spendRows, 8),
      });
      return;
    }
    setPopup({ title: label, lines: aggregateMerchants(spendMerch, label) });
  }

  function openIncome(label: string) {
    if (label === OTHER_CATEGORIES) {
      setPopup({
        title: OTHER_CATEGORIES,
        lines: leftoverMerchants(incomeMerch, incomeRows, 6),
      });
      return;
    }
    setPopup({ title: label, lines: aggregateMerchants(incomeMerch, label) });
  }

  return (
    <>
      <Tabs defaultValue="cashflow">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="cashflow">Cash flow</TabsTrigger>
            <TabsTrigger value="spending">Spending</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
          <ChartRange value={range} onChange={setRange} />
        </div>

        <TabsContent value="cashflow">
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
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Spending by category</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryBars data={spendRows} onBarClick={openSpend} />
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Where money moves</CardTitle>
              <Delta value={savings} className="text-lg" />
            </CardHeader>
            <CardContent>
              <CashflowSankey
                income={incomeRows}
                spend={spendRows}
                onSpendClick={openSpend}
                onIncomeClick={openIncome}
                onBalanceClick={(kind) => {
                  if (kind === "from-savings") {
                    setPopup({
                      title: FROM_SAVINGS,
                      note: "Spending exceeded income in this window. This is the gap, covered from cash on hand — not extra income.",
                      lines: spendRows.map((r) => ({ category: r.label, merchant: r.label, amount: r.value })),
                    });
                  } else {
                    setPopup({
                      title: TO_SAVINGS,
                      note: "Income exceeded spending. This is what was left after bills — it is not a spend category.",
                      lines: incomeRows.map((r) => ({ category: r.label, merchant: r.label, amount: r.value })),
                    });
                  }
                }}
              />
            </CardContent>
          </Card>
          <Card className="mt-4">
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
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Month by month</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-5 py-2 text-left font-medium">Month</th>
                    <th className="px-5 py-2 text-right font-medium">Income</th>
                    <th className="px-5 py-2 text-right font-medium">Spend</th>
                    <th className="px-5 py-2 text-right font-medium">Saved</th>
                    <th className="px-5 py-2 text-right font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {sliced.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                        No cashflow in this window.
                      </td>
                    </tr>
                  ) : (
                    sliced.map((m) => (
                      <tr key={m.month} className="border-b border-border last:border-0">
                        <td className="px-5 py-2 font-mono tabular-nums">{m.month}</td>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spending">
          <div className="mb-4">
            <div className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">Spending</div>
            <div className="text-3xl font-medium font-mono tabular-nums">
              <Money value={spend} />
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>By category</CardTitle>
            </CardHeader>
            <CardContent>
              <AllocationChart
                data={spendRows.map((r) => ({ key: r.label, value: r.value }))}
                large
                showPercent
                selectable
                selected={spendSel}
                onToggle={(key) => toggle(spendSel, key, spendKeys, setSpendSel)}
                onSliceClick={openSpend}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="income">
          <div className="mb-4">
            <div className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">Income</div>
            <div className="text-3xl font-medium font-mono tabular-nums">
              <Money value={income} />
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>By source</CardTitle>
            </CardHeader>
            <CardContent>
              <AllocationChart
                data={incomeRows.map((r) => ({ key: r.label, value: r.value }))}
                large
                showPercent
                selectable
                selected={incomeSel}
                onToggle={(key) => toggle(incomeSel, key, incomeKeys, setIncomeSel)}
                onSliceClick={openIncome}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <CategoryMerchantDialog
        open={popup != null}
        title={popup?.title ?? ""}
        lines={popup?.lines ?? []}
        note={popup?.note}
        onClose={() => setPopup(null)}
      />
    </>
  );
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
