"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, X } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { Money } from "@/components/money";
import { Pill } from "@/components/pills";
import { BrandLabel } from "@/components/brand-mark";
import { CardIcon } from "@/components/card-icon";
import { CategoryMerchantDialog } from "@/components/category-merchants";
import { recurringMerchantKey } from "@/lib/categories";
import { billKey, type RecurringBill, type RecurringKind } from "@/lib/recurring";
import type { MerchantLine } from "@/lib/merchant-lines";
import type { TxnRow } from "@/lib/txn-row";
import { TransactionSheet } from "./table";

const CADENCE_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  bimonthly: "Every 2 months",
  quarterly: "Quarterly",
  semiannual: "Twice a year",
  annual: "Yearly",
};

export const RECURRING_KINDS: { kind: RecurringKind; title: string; accent: string; empty: string }[] = [
  { kind: "loan", title: "Loan payments", accent: "#D4928C", empty: "No loan payments found." },
  { kind: "bill", title: "Bills", accent: "#7EABD4", empty: "No bills found." },
  { kind: "subscription", title: "Subscriptions", accent: "#B59BD9", empty: "No subscriptions found." },
];

/** Every charge behind one bill, matched the way recurring.ts groups them, as the same window the Sankey opens. */
function billLines(rows: TxnRow[], label: string): MerchantLine[] {
  const key = billKey(label);
  const txns = rows
    .filter((t) => !t.internal && t.amount > 0 && billKey(t.merchant) === key)
    .sort((a, b) => b.date.localeCompare(a.date));
  return txns.length ? [{ category: label, merchant: label, amount: txns.reduce((s, t) => s + t.amount, 0), txns }] : [];
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
            {r.manual ? <span>{" · "}Added by you</span> : null}
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
  meta: (typeof RECURRING_KINDS)[number];
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

/** The Recurring tab, shared by Transactions and Spending. */
export function RecurringPanel({ recurring, rows, removedCount }: { recurring: RecurringBill[]; rows: TxnRow[]; removedCount: number }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  // Bills removed so far. Counted here as well as on the server so Restore shows the moment one is removed.
  const [removed, setRemoved] = useState(removedCount);
  const [seenCount, setSeenCount] = useState(removedCount);
  if (seenCount !== removedCount) {
    setSeenCount(removedCount);
    setRemoved(removedCount);
  }
  const [open, setOpen] = useState<RecurringBill | null>(null);
  const [edit, setEdit] = useState<TxnRow | null>(null);
  const visible = useMemo(
    () => recurring.filter((r) => !dismissed.has(recurringMerchantKey(r.label))).sort((a, b) => b.annual - a.annual),
    [recurring, dismissed],
  );
  const byKind = useMemo(
    () => Object.fromEntries(RECURRING_KINDS.map((k) => [k.kind, visible.filter((r) => r.kind === k.kind)])) as Record<RecurringKind, RecurringBill[]>,
    [visible],
  );
  const lines = useMemo(() => (open ? billLines(rows, open.label) : []), [open, rows]);

  async function restore() {
    const res = await fetch("/api/merchant-rules", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast.error("Could not bring back removed bills.");
      return;
    }
    setDismissed(new Set());
    setRemoved(0);
    router.refresh();
  }

  function remove(label: string) {
    const key = recurringMerchantKey(label);
    setDismissed((cur) => new Set(cur).add(key));
    setRemoved((n) => n + 1);
    void fetch("/api/merchant-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant: label, ignoreRecurring: true }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("dismiss failed");
        router.refresh();
      })
      .catch(() => {
        setDismissed((cur) => {
          const next = new Set(cur);
          next.delete(key);
          return next;
        });
        setRemoved((n) => Math.max(0, n - 1));
        toast.error("Could not remove it.");
      });
  }

  return (
    <div className="page-stack">
      <div className="pills pills-trio">
        {RECURRING_KINDS.map((k) => (
          <Pill key={k.kind} kicker={`Per month · ${k.title}`} accent={k.accent}>
            <Money value={byKind[k.kind].reduce((s, r) => s + r.monthly, 0)} />
          </Pill>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No charges land on a steady schedule yet. Bills show up here after a few regular charges.</p>
      ) : (
        <div className="grid items-stretch gap-4 xl:grid-cols-3">
          {RECURRING_KINDS.map((k) => (
            <BillColumn key={k.kind} meta={k} bills={byKind[k.kind]} onRemove={remove} onOpen={setOpen} />
          ))}
        </div>
      )}
      {removed > 0 ? (
        <div className="flex justify-end">
          <ConfirmButton
            title={`Bring back ${removed} removed ${removed === 1 ? "bill" : "bills"}?`}
            description="Anything you removed from Recurring is detected again."
            confirmLabel="Continue"
            confirmVariant="default"
            onConfirm={restore}
            ariaLabel="Restore removed bills"
          >
            <RotateCcw /> Restore removed ({removed})
          </ConfirmButton>
        </div>
      ) : null}
      <CategoryMerchantDialog
        open={open != null}
        title={open?.label ?? ""}
        lines={lines}
        onClose={() => setOpen(null)}
        onOpenTxn={setEdit}
        positiveAmounts
      />
      <TransactionSheet row={edit} onClose={() => setEdit(null)} onSaved={() => router.refresh()} />
    </div>
  );
}
