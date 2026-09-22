"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { HeroCard } from "@/components/hero-card";
import { Pills, Pill } from "@/components/pills";
import { ChartCard } from "@/components/chart-card";
import { AllocationChart, CashflowSankey } from "@/components/charts";
import { FROM_SAVINGS, OTHER_CATEGORIES } from "@/lib/flow-labels";
import { formatDate, formatPct } from "@/lib/format";
import { ReportRange } from "@/components/chart-range";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { asLocalDate, defaultReportWindow, inWindow, ymKey, type WindowKey } from "@/lib/range";
import { format } from "date-fns";
import { CategoryMerchantDialog } from "@/components/category-merchants";
import { aggregateMerchants, type MerchantLine } from "@/lib/merchant-lines";
import { BrandLabel } from "@/components/brand-mark";

type FlowRow = {
  date: string;
  month: string;
  kind: "spend" | "income";
  category: string;
  merchant: string;
  amount: number;
};

type RecurringRow = { label: string; amount: number; cadence: string; lastDate: string; annual: number };

export function ReportsClient({
  flows,
  recurring,
}: {
  flows: FlowRow[];
  recurring: RecurringRow[];
}) {
  const [range, setRange] = useState<WindowKey>(defaultReportWindow());
  const [spendSel, setSpendSel] = useState<Set<string> | null>(null);
  const [incomeSel, setIncomeSel] = useState<Set<string> | null>(null);
  const [popup, setPopup] = useState<
    | { kind: "spend" | "income"; title: string; from: "tabs" | "cash" }
    | { kind: "note"; title: string; note: string; lines: MerchantLine[] }
    | null
  >(null);
  const [netRefunds, setNetRefunds] = useState(true);

  const slicedFlows = useMemo(
    () => flows.filter((f) => inWindow(f.date, range)),
    [flows, range],
  );
  const tabFlows = useMemo(
    () => (netRefunds ? applyMerchantRefunds(slicedFlows) : slicedFlows),
    [slicedFlows, netRefunds],
  );
  const months = useMemo(() => {
    const byMonth: Record<string, { income: number; spend: number }> = {};
    let min: string | null = null;
    let max = ymKey(new Date());
    for (const f of flows) {
      const row = byMonth[f.month] ?? { income: 0, spend: 0 };
      if (f.kind === "spend") row.spend += f.amount;
      else row.income += f.amount;
      byMonth[f.month] = row;
      if (!min || f.month < min) min = f.month;
      if (f.month > max) max = f.month;
    }
    if (!min) return [];
    const out: { month: string; label: string; income: number; spend: number; savings: number }[] = [];
    const [ys, ms] = min.split("-").map(Number);
    const [ye, me] = max.split("-").map(Number);
    let y = ye;
    let m = me;
    while (y > ys || (y === ys && m >= ms)) {
      const month = `${y}-${String(m).padStart(2, "0")}`;
      const v = byMonth[month] ?? { income: 0, spend: 0 };
      out.push({
        month,
        label: format(asLocalDate(`${month}-01`), "MMM yyyy"),
        income: v.income,
        spend: v.spend,
        savings: v.income - v.spend,
      });
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return out;
  }, [flows]);
  const cash = useMemo(() => aggregateFlows(slicedFlows), [slicedFlows]);
  const tabs = useMemo(() => aggregateFlows(tabFlows), [tabFlows]);
  const spendRows = tabs.spendRows;
  const incomeRows = tabs.incomeRows;
  const spendMerch = tabs.spendMerch;
  const incomeMerch = tabs.incomeMerch;
  const spendKeys = spendRows.map((r) => r.label);
  const incomeKeys = incomeRows.map((r) => r.label);
  const spendVisible = spendSel == null ? spendRows : spendRows.filter((r) => spendSel.has(r.label));
  const incomeVisible = incomeSel == null ? incomeRows : incomeRows.filter((r) => incomeSel.has(r.label));
  const spend = spendVisible.reduce((s, r) => s + r.value, 0);
  const income = incomeVisible.reduce((s, r) => s + r.value, 0);
  const spendAll = cash.spendRows.reduce((s, r) => s + r.value, 0);
  const incomeAll = cash.incomeRows.reduce((s, r) => s + r.value, 0);
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
    return Object.entries(map)
      .filter(([, amount]) => Math.abs(amount) > 0.005)
      .map(([merchant, amount]) => ({
        category: OTHER_CATEGORIES,
        merchant,
        amount,
      }));
  }

  function spendPopupLines(title: string, merch: MerchantLine[], ranked: { label: string }[], credits: MerchantLine[]) {
    const base =
      title === OTHER_CATEGORIES ? leftoverMerchants(merch, ranked, 8) : aggregateMerchants(merch, title);
    if (netRefunds) return base.filter((l) => Math.abs(l.amount) > 0.005);
    const names = base.map((l) => l.merchant);
    return [...base, ...refundLinesForMerchants(names, credits)].filter((l) => Math.abs(l.amount) > 0.005);
  }

  function incomePopupLines(title: string, merch: MerchantLine[], ranked: { label: string }[]) {
    const base =
      title === OTHER_CATEGORIES ? leftoverMerchants(merch, ranked, 6) : aggregateMerchants(merch, title);
    return base.filter((l) => Math.abs(l.amount) > 0.005);
  }

  const popupLines: MerchantLine[] = (() => {
    if (!popup) return [];
    if (popup.kind === "note") return popup.lines;
    if (popup.kind === "spend") {
      const merch = popup.from === "cash" ? cash.spendMerch : spendMerch;
      const ranked = popup.from === "cash" ? cash.spendRows : spendRows;
      const credits = popup.from === "tabs" ? incomeMerch : [];
      return spendPopupLines(popup.title, merch, ranked, credits);
    }
    const merch = popup.from === "cash" ? cash.incomeMerch : incomeMerch;
    const ranked = popup.from === "cash" ? cash.incomeRows : incomeRows;
    return incomePopupLines(popup.title, merch, ranked);
  })();
  const popupNote = popup?.kind === "note" ? popup.note : undefined;

  function setNet(next: boolean) {
    setNetRefunds(next);
    setSpendSel(null);
    setIncomeSel(null);
  }

  return (
    <>
      <Tabs defaultValue="cashflow">
        <div className="section-head mb-4">
          <TabsList>
            <TabsTrigger value="cashflow">Cash flow</TabsTrigger>
            <TabsTrigger value="spending">Spending</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
          <ReportRange value={range} onChange={setRange} />
        </div>

        <TabsContent value="cashflow">
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
          <Card className="mt-4">
            <CardHeader row>
              <CardTitle>Where money moves</CardTitle>
            </CardHeader>
            <CardContent>
              <CashflowSankey
                income={cash.incomeRows}
                spend={cash.spendRows}
                onSpendClick={(label) => setPopup({ kind: "spend", title: label, from: "cash" })}
                onIncomeClick={(label) => setPopup({ kind: "income", title: label, from: "cash" })}
                onBalanceClick={(kind) => {
                  if (kind !== "from-savings") return;
                  setPopup({
                    kind: "note",
                    title: FROM_SAVINGS,
                    note: "Spending exceeded income in this window. This is the gap, covered from cash on hand — not extra income.",
                    lines: cash.spendRows.map((r) => ({ category: r.label, merchant: r.label, amount: r.value })),
                  });
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
                      <div className="footnote">
                        <Money value={r.annual} /> / yr
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
              <div className="max-h-[min(28rem,calc(100dvh-18rem))] overflow-y-auto overscroll-contain">
                <table className="data-table">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b border-border">
                      <th className="kicker">Month</th>
                      <th className="kicker num">Income</th>
                      <th className="kicker num">Spend</th>
                      <th className="kicker num">Saved</th>
                      <th className="kicker num">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground">
                          No cashflow yet.
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
                          <td className="num">
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
        </TabsContent>

        <TabsContent value="spending">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <HeroCard kicker="Spending">
              <Money value={spend} />
            </HeroCard>
            <NetRefundsToggle checked={netRefunds} onChange={setNet} />
          </div>
          <ChartCard kicker="By category">
              <AllocationChart
                key={netRefunds ? "spend-net" : "spend-raw"}
                data={spendRows.map((r) => ({ key: r.label, value: r.value }))}
                showPercent
                selectable
                selected={spendSel}
                onToggle={(key) => toggle(spendSel, key, spendKeys, setSpendSel)}
                onSliceClick={(label) => setPopup({ kind: "spend", title: label, from: "tabs" })}
              />
          </ChartCard>
        </TabsContent>

        <TabsContent value="income">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <HeroCard kicker="Income">
              <Money value={income} />
            </HeroCard>
            <NetRefundsToggle checked={netRefunds} onChange={setNet} />
          </div>
          <ChartCard kicker="By source">
              <AllocationChart
                key={netRefunds ? "income-net" : "income-raw"}
                data={incomeRows.map((r) => ({ key: r.label, value: r.value }))}
                showPercent
                selectable
                selected={incomeSel}
                onToggle={(key) => toggle(incomeSel, key, incomeKeys, setIncomeSel)}
                onSliceClick={(label) => setPopup({ kind: "income", title: label, from: "tabs" })}
              />
          </ChartCard>
        </TabsContent>
      </Tabs>
      <CategoryMerchantDialog
        open={popup != null}
        title={popup?.title ?? ""}
        lines={popupLines}
        note={popupNote}
        onClose={() => setPopup(null)}
      />
    </>
  );
}

function merchantKey(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function refundLinesForMerchants(spendMerchants: string[], credits: MerchantLine[]): MerchantLine[] {
  const want = new Set(spendMerchants.map(merchantKey).filter(Boolean));
  if (!want.size) return [];
  const byMerch: Record<string, { merchant: string; category: string; amount: number }> = {};
  for (const l of credits) {
    const k = merchantKey(l.merchant);
    if (!want.has(k)) continue;
    const cur = byMerch[k] ?? { merchant: l.merchant, category: l.category, amount: 0 };
    cur.amount += l.amount;
    byMerch[k] = cur;
  }
  return Object.values(byMerch)
    .filter((r) => r.amount > 0.005)
    .map((r) => ({
      category: r.category,
      merchant: r.merchant,
      amount: -r.amount,
    }));
}

/** Credits from a merchant that also has spend in the window are treated as refunds. */
function applyMerchantRefunds(flows: FlowRow[]): FlowRow[] {
  const groups = new Map<string, FlowRow[]>();
  const unmatched: FlowRow[] = [];
  for (const f of flows) {
    const key = merchantKey(f.merchant);
    if (!key) {
      unmatched.push(f);
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }
  const out: FlowRow[] = [...unmatched];
  for (const rows of groups.values()) {
    const spend = rows.filter((r) => r.kind === "spend");
    const income = rows.filter((r) => r.kind === "income");
    const spendSum = spend.reduce((s, r) => s + r.amount, 0);
    const incomeSum = income.reduce((s, r) => s + r.amount, 0);
    if (!(spendSum > 0 && incomeSum > 0)) {
      out.push(...rows);
      continue;
    }
    const refund = Math.min(spendSum, incomeSum);
    let left = refund;
    const spendNewest = [...spend].sort((a, b) => b.date.localeCompare(a.date));
    for (const s of spendNewest) {
      if (left <= 0) {
        out.push(s);
        continue;
      }
      const take = Math.min(s.amount, left);
      left -= take;
      const remain = s.amount - take;
      if (remain > 0.005) out.push({ ...s, amount: remain });
    }
    let keepIncome = incomeSum - refund;
    const incomeOldest = [...income].sort((a, b) => a.date.localeCompare(b.date));
    for (const i of incomeOldest) {
      if (keepIncome <= 0.005) continue;
      const keep = Math.min(i.amount, keepIncome);
      keepIncome -= keep;
      if (keep > 0.005) out.push({ ...i, amount: keep });
    }
  }
  return out;
}

function aggregateFlows(rows: FlowRow[]) {
  const spendCats: Record<string, number> = {};
  const incomeCats: Record<string, number> = {};
  const spendMerch: MerchantLine[] = [];
  const incomeMerch: MerchantLine[] = [];
  for (const f of rows) {
    if (f.kind === "spend") {
      spendCats[f.category] = (spendCats[f.category] ?? 0) + f.amount;
      spendMerch.push({ category: f.category, merchant: f.merchant, amount: f.amount });
    } else {
      incomeCats[f.category] = (incomeCats[f.category] ?? 0) + f.amount;
      incomeMerch.push({ category: f.category, merchant: f.merchant, amount: f.amount });
    }
  }
  const spendRows = Object.entries(spendCats)
    .map(([label, value]) => ({ label, value }))
    .filter((r) => r.value > 0.005)
    .sort((a, b) => b.value - a.value);
  const incomeRows = Object.entries(incomeCats)
    .map(([label, value]) => ({ label, value }))
    .filter((r) => r.value > 0.005)
    .sort((a, b) => b.value - a.value);
  return { spendRows, incomeRows, spendMerch, incomeMerch };
}

function NetRefundsToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex max-w-sm cursor-pointer items-start gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        className="mt-0.5 cursor-pointer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        Net merchant refunds
        <span className="mt-0.5 block text-xs">
          Credits from a merchant in this window reduce that merchant’s spend and are hidden from income.
        </span>
      </span>
    </label>
  );
}


