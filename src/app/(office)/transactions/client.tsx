"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmButton } from "@/components/confirm-button";
import { Money } from "@/components/money";
import { Pill } from "@/components/pills";
import { BrandLabel } from "@/components/brand-mark";
import { CardIcon } from "@/components/card-icon";
import { CategoryMerchantDialog } from "@/components/category-merchants";
import { recurringMerchantKey } from "@/lib/categories";
import { defaultReportWindow } from "@/lib/range";
import { billKey, type RecurringBill, type RecurringKind } from "@/lib/recurring";
import type { MerchantLine } from "@/lib/merchant-lines";
import type { TrendPoint } from "@/lib/spend-compare";
import type { TxnRow } from "@/lib/txn-row";
import { TransactionSheet, TransactionsTable } from "./table";

/** A credit that is not pay, interest, or a transfer. Listed before spend is reduced by it. */
function isRefund(t: TxnRow) {
  if (t.amount >= 0 || t.isTransfer || t.isCcPayment) return false;
  const code = (t.category ?? "").toUpperCase();
  if (code === "TRANSFER" || code === "INCOME" || code.startsWith("INCOME_")) return false;
  return true;
}

const CADENCE_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  bimonthly: "Every 2 months",
  quarterly: "Quarterly",
  semiannual: "Twice a year",
  annual: "Yearly",
};

const KINDS: { kind: RecurringKind; title: string; accent: string; empty: string }[] = [
  { kind: "loan", title: "Loan payments", accent: "#D4928C", empty: "No loan payments found." },
  { kind: "bill", title: "Bills", accent: "#7EABD4", empty: "No bills found." },
  { kind: "subscription", title: "Subscriptions", accent: "#B59BD9", empty: "No subscriptions found." },
];

/** Every charge behind one bill, matched the way recurring.ts groups them, as the same window the Sankey opens. */
function billWindow(rows: TxnRow[], label: string, now = new Date()): { lines: MerchantLine[]; trend: TrendPoint[] } {
  const key = billKey(label);
  const txns = rows
    .filter((t) => !t.internal && t.amount > 0 && billKey(t.merchant) === key)
    .sort((a, b) => b.date.localeCompare(a.date));
  const byMonth = new Map<string, number>();
  for (const t of txns) byMonth.set(t.date.slice(0, 7), (byMonth.get(t.date.slice(0, 7)) ?? 0) + t.amount);
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const trend: TrendPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    trend.push({ month, label: d.toLocaleString("en-US", { month: "short" }), value: byMonth.get(month) ?? 0, partial: month === current });
  }
  // Start the chart at the first month with a charge, so a new bill isn't a row of empty months.
  const first = trend.findIndex((p) => p.value > 0);
  return {
    lines: txns.length ? [{ category: label, merchant: label, amount: txns.reduce((s, t) => s + t.amount, 0), txns }] : [],
    trend: first < 0 ? [] : trend.slice(first),
  };
}

function BillRow({ r, onRemove, onOpen }: { r: RecurringBill; onRemove: (label: string) => void; onOpen: (r: RecurringBill) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0">
      <button
        type="button"
        onClick={() => onOpen(r)}
        className="-mx-2 flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={`Show charges from ${r.label}`}
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <BrandLabel className="min-w-0 max-w-full" kind="merchant" name={r.label}>
            <span className="truncate text-sm">{r.label}</span>
          </BrandLabel>
          <div className="text-xs text-muted-foreground">
            <span>{CADENCE_LABEL[r.cadence] ?? r.cadence}</span>
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
      </button>
      <ConfirmButton
        title={`Remove ${r.label} from Recurring?`}
        description="It stops being listed as a bill. Its transactions stay."
        onConfirm={() => onRemove(r.label)}
        ariaLabel={`Remove ${r.label}`}
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground"
      >
        {/* An icon keeps the name room to breathe in a third-width column. */}
        <X />
      </ConfirmButton>
    </div>
  );
}

/** One kind of recurring charge as its own card: a colored top edge, the title and count, then its rows. */
function BillColumn({
  meta,
  bills,
  onRemove,
  onOpen,
}: {
  meta: (typeof KINDS)[number];
  bills: RecurringBill[];
  onRemove: (label: string) => void;
  onOpen: (r: RecurringBill) => void;
}) {
  return (
    <section className="chart-card flex min-w-0 flex-col border-t-2" style={{ borderTopColor: meta.accent }}>
      <div className="kicker card-title">
        <span className="inline-flex items-center">
          <CardIcon title={meta.title} />
          {meta.title}
        </span>
        <span className="footnote normal-case tracking-normal">{bills.length}</span>
      </div>
      {bills.length === 0 ? (
        <p className="text-sm text-muted-foreground">{meta.empty}</p>
      ) : (
        <div>
          {bills.map((r) => (
            <BillRow key={r.label} r={r} onRemove={onRemove} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

function RecurringPanel({ recurring, rows, removedCount }: { recurring: RecurringBill[]; rows: TxnRow[]; removedCount: number }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<RecurringBill | null>(null);
  const [edit, setEdit] = useState<TxnRow | null>(null);
  const visible = useMemo(
    () => recurring.filter((r) => !dismissed.has(recurringMerchantKey(r.label))).sort((a, b) => b.annual - a.annual),
    [recurring, dismissed],
  );
  const byKind = useMemo(
    () => Object.fromEntries(KINDS.map((k) => [k.kind, visible.filter((r) => r.kind === k.kind)])) as Record<RecurringKind, RecurringBill[]>,
    [visible],
  );
  const detail = useMemo(() => (open ? billWindow(rows, open.label) : null), [open, rows]);

  async function restore() {
    const res = await fetch("/api/merchant-rules", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast.error("Could not bring back removed bills.");
      return;
    }
    setDismissed(new Set());
    router.refresh();
  }

  function remove(label: string) {
    const key = recurringMerchantKey(label);
    setDismissed((cur) => new Set(cur).add(key));
    void fetch("/api/merchant-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant: label, ignoreRecurring: true }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("dismiss failed");
      })
      .catch(() => {
        setDismissed((cur) => {
          const next = new Set(cur);
          next.delete(key);
          return next;
        });
      });
  }

  return (
    <div className="page-stack">
      <div className="pills pills-trio">
        {KINDS.map((k) => (
          <Pill key={k.kind} kicker={`Per month · ${k.title}`} accent={k.accent}>
            <Money value={byKind[k.kind].reduce((s, r) => s + r.monthly, 0)} />
          </Pill>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No charges land on a steady schedule yet. Bills show up here after a few regular charges.</p>
      ) : (
        <div className="grid items-stretch gap-4 lg:grid-cols-3">
          {KINDS.map((k) => (
            <BillColumn key={k.kind} meta={k} bills={byKind[k.kind]} onRemove={remove} onOpen={setOpen} />
          ))}
        </div>
      )}
      {removedCount > 0 ? (
        <div className="flex justify-end">
          <ConfirmButton
            title={`Bring back ${removedCount} removed ${removedCount === 1 ? "bill" : "bills"}?`}
            description="Anything you removed from Recurring is detected again."
            onConfirm={restore}
            ariaLabel="Restore removed bills"
          >
            <RotateCcw /> Restore removed ({removedCount})
          </ConfirmButton>
        </div>
      ) : null}
      <CategoryMerchantDialog
        open={open != null}
        title={open?.label ?? ""}
        lines={detail?.lines ?? []}
        trend={detail?.trend}
        onClose={() => setOpen(null)}
        onOpenTxn={setEdit}
        positiveAmounts
      />
      <TransactionSheet row={edit} onClose={() => setEdit(null)} onSaved={() => router.refresh()} />
    </div>
  );
}

export function TransactionsView({
  rows,
  recurring,
  removedCount,
  initialQuery,
}: {
  rows: TxnRow[];
  recurring: RecurringBill[];
  /** Bills the household removed from Recurring, which Restore brings back. */
  removedCount: number;
  initialQuery: string;
}) {
  const [tab, setTab] = useState("all");
  const refunds = useMemo(() => rows.filter((t) => !t.internal && isRefund(t)), [rows]);
  const tabs = (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="recurring">Recurring</TabsTrigger>
        <TabsTrigger value="refunds">Refunds</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (tab === "recurring") {
    // Same header row and gap as the table's, so the tabs never move between All, Recurring, and Refunds.
    return (
      <div>
        <div className="section-head txn-toolbar">{tabs}</div>
        <RecurringPanel recurring={recurring} rows={rows} removedCount={removedCount} />
      </div>
    );
  }
  if (tab === "refunds") {
    return (
      <TransactionsTable key="refunds" rows={refunds} dateChips defaultRange={defaultReportWindow()} lead={tabs} />
    );
  }
  return <TransactionsTable key="all" rows={rows} dateChips initialQuery={initialQuery} lead={tabs} />;
}
