"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmButton } from "@/components/confirm-button";
import { Money } from "@/components/money";
import { Pill } from "@/components/pills";
import { BrandLabel } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import { recurringMerchantKey } from "@/lib/categories";
import { defaultReportWindow } from "@/lib/range";
import type { RecurringBill } from "@/lib/recurring";
import type { TxnRow } from "@/lib/txn-row";
import { TransactionsTable } from "./table";

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

function BillRow({ r, onRemove }: { r: RecurringBill; onRemove: (label: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
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
      </div>
      <ConfirmButton
        title={`Remove ${r.label} from Recurring?`}
        description="It stops being listed as a bill. Its transactions stay."
        onConfirm={() => onRemove(r.label)}
        ariaLabel={`Remove ${r.label}`}
        className="shrink-0 px-2 sm:px-3"
      >
        <X className="sm:hidden" />
        <span className="hidden sm:inline">Remove</span>
      </ConfirmButton>
    </div>
  );
}

function BillSection({
  title,
  bills,
  onRemove,
}: {
  title: string;
  bills: RecurringBill[];
  onRemove: (label: string) => void;
}) {
  if (bills.length === 0) return null;
  const monthly = bills.reduce((s, r) => s + r.monthly, 0);
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="footnote whitespace-nowrap">
          <Money value={monthly} /> / month
        </span>
      </div>
      {bills.map((r) => (
        <BillRow key={r.label} r={r} onRemove={onRemove} />
      ))}
    </section>
  );
}

function RecurringPanel({ recurring }: { recurring: RecurringBill[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const visible = useMemo(
    () => recurring.filter((r) => !dismissed.has(recurringMerchantKey(r.label))).sort((a, b) => b.annual - a.annual),
    [recurring, dismissed],
  );
  const loans = useMemo(() => visible.filter((r) => r.kind === "loan"), [visible]);
  const subs = useMemo(() => visible.filter((r) => r.kind !== "loan"), [visible]);
  const totals = useMemo(
    () => ({
      monthly: visible.reduce((s, r) => s + r.monthly, 0),
      annual: visible.reduce((s, r) => s + r.annual, 0),
      changed: visible.filter((r) => r.priceChange).length,
    }),
    [visible],
  );

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
    <Card>
      <CardHeader>
        <CardTitle>Recurring</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Need at least three similar charges at a regular cadence to infer a bill.
          </p>
        ) : (
          <>
            <div className="pills pills-compact pills-trio">
              <Pill kicker="Per month" accent="#D4928C">
                <Money value={totals.monthly} />
              </Pill>
              <Pill kicker="Per year" accent="#7EABD4">
                <Money value={totals.annual} />
              </Pill>
              <Pill kicker="Price changes" accent="#D4BE7A">
                <span className={cn("num", totals.changed > 0 && "text-accent")}>{totals.changed}</span>
              </Pill>
            </div>
            <BillSection title="Loan payments" bills={loans} onRemove={remove} />
            <BillSection title="Subscriptions and bills" bills={subs} onRemove={remove} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function TransactionsView({
  rows,
  recurring,
  initialQuery,
}: {
  rows: TxnRow[];
  recurring: RecurringBill[];
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
    return (
      <div className="page-stack">
        <div className="section-head">{tabs}</div>
        <RecurringPanel recurring={recurring} />
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
