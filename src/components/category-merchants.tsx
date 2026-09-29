"use client";

import { useEffect, useState } from "react";
import { ChevronRight, StickyNote } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Money } from "./money";
import { BrandLabel, BrandMark } from "./brand-mark";
import { CategoryIcon, hasCategoryIcon } from "@/lib/category-icons";
import { categoryLabel } from "@/lib/constants";
import { ESPP_LABEL, VEST_LABEL } from "@/lib/equity-comp";
import { formatDate } from "@/lib/format";
import { breakdownSummary, lineLabel, type FlowEvent, type MerchantLine } from "@/lib/merchant-lines";
import { RETIREMENT_CONTRIBUTION_LABEL } from "@/lib/outside-deposits";
import type { TxnRow } from "@/lib/txn-row";
import { cn } from "@/lib/utils";
import type { TrendPoint } from "@/lib/spend-compare";
import { CategoryTrendChart } from "./category-trend";

const MIN_BREAKDOWN = 10;

export function CategoryMerchantDialog({
  open,
  title,
  lines,
  onClose,
  note,
  onOpenTxn,
  positiveAmounts,
  trend,
}: {
  open: boolean;
  title: string;
  lines: MerchantLine[];
  onClose: () => void;
  note?: string;
  onOpenTxn?: (txn: TxnRow) => void;
  /** Spending breakdown shows outflows as positive amounts. */
  positiveAmounts?: boolean;
  /** This category month by month, shown above the merchants when there are two or more months. */
  trend?: TrendPoint[];
}) {
  const rows = [...lines].sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const expandable = rows.some((r) => r.txns || r.events);
  const eventOnly = rows.length > 0 && rows.every((r) => r.events?.length && !r.txns?.length);
  const [openMerchants, setOpenMerchants] = useState<Set<string>>(new Set());
  useEffect(() => {
    setOpenMerchants(new Set());
  }, [title, open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={expandable && !eventOnly ? "max-w-4xl" : "max-w-xl"}
        onPointerDownOutside={(e) => {
          const node = e.target as HTMLElement | null;
          if (node?.closest?.("[data-haus-sheet]")) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          const node = e.target as HTMLElement | null;
          if (node?.closest?.("[data-haus-sheet]")) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasCategoryIcon(title) ? <CategoryIcon category={title} className="h-4 w-4" /> : null}
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="mb-3 text-sm text-muted-foreground">
          {note ? <p className="mb-2">{note}</p> : null}
          {breakdownSummary(title, rows)}{" "}
          · <Money value={positiveAmounts ? Math.abs(total) : total} signed={!positiveAmounts && total < 0} />
        </div>
        {trend && trend.length >= 2 ? (
          <div className="mb-4">
            <CategoryTrendChart category={title} data={trend} />
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyWindow(title)}</p>
        ) : (
          <ul className="space-y-2 pr-1">
            {rows.map((r, i) => {
              const key = r.merchant;
              const expanded = openMerchants.has(key);
              const txns = [...(r.txns ?? [])].sort((a, b) => b.date.localeCompare(a.date));
              const events = [...(r.events ?? [])].sort((a, b) => b.date.localeCompare(a.date));
              const canExpand = Boolean(r.txns || r.events);
              return (
                <li key={`${r.merchant}-${r.amount}-${i}`} className="text-sm">
                  {canExpand ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-1 text-left hover:bg-secondary/60"
                      onClick={() =>
                        setOpenMerchants((cur) => {
                          const next = new Set(cur);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                        <LineName line={r} title={title} />
                      </span>
                      <span className="shrink-0 num">
                        <Money value={positiveAmounts ? Math.abs(r.amount) : r.amount} signed={!positiveAmounts && r.amount < 0} />
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <LineName line={r} title={title} />
                      <span className="shrink-0 num">
                        <Money value={positiveAmounts ? Math.abs(r.amount) : r.amount} signed={!positiveAmounts && r.amount < 0} />
                      </span>
                    </div>
                  )}
                  {expanded && txns.length > 0 ? (
                    <ul className="mt-2 space-y-1 border-l border-border pl-3">
                      {txns.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-secondary/60"
                            onClick={() => onOpenTxn?.(t)}
                          >
                            <span className="num w-24 shrink-0 text-xs text-muted-foreground">{formatDate(t.date)}</span>
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {t.account}
                              {t.ownerLabel ? ` · ${t.ownerLabel}` : ""}
                              {" · "}
                              {categoryLabel(t.category)}
                            </span>
                            {t.memo ? <StickyNote className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Has a note" /> : null}
                            <span className="num shrink-0 text-xs text-muted-foreground">
                              <Money value={Math.abs(t.amount)} className="text-xs text-muted-foreground" />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {expanded && events.length > 0 ? <EventList events={events} /> : null}
                  {expanded && txns.length === 0 && events.length === 0 ? (
                    <p className="py-2 pl-6 text-xs text-muted-foreground">No individual transactions in this window.</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LineName({ line, title }: { line: MerchantLine; title: string }) {
  if (line.txns?.length && !line.events?.length) {
    return (
      <BrandLabel className="min-w-0" kind={line.logo ? "institution" : "merchant"} name={line.logo ?? line.merchant}>
        <span className="truncate">{line.merchant}</span>
      </BrandLabel>
    );
  }
  const label = lineLabel(line, title);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 overflow-hidden">
      <BrandMark kind={label.kind} name={label.mark} />
      <span className="min-w-0 truncate">{label.name}</span>
      {label.aside ? <span className="max-w-[45%] shrink truncate text-xs text-muted-foreground">{label.aside}</span> : null}
    </span>
  );
}

function emptyWindow(title: string) {
  if (title === VEST_LABEL) return "No vests in this window.";
  if (title === ESPP_LABEL) return "No purchases in this window.";
  if (title === RETIREMENT_CONTRIBUTION_LABEL) return "No contributions in this window.";
  return "No transactions in this window.";
}

/** A vest, purchase, or deposit has a date and an amount, and no bank transaction to open. */
function EventList({ events }: { events: FlowEvent[] }) {
  return (
    <ul className="mt-2 space-y-1 border-l border-border pl-3">
      {events.map((event) => (
        <li key={event.id} className="flex items-center gap-3 px-2 py-1.5">
          <span className="num w-24 shrink-0 text-xs text-muted-foreground">{formatDate(event.date)}</span>
          {event.detail ? <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{event.detail}</span> : null}
          <span className="num ml-auto shrink-0 text-xs text-muted-foreground">
            <Money value={Math.abs(event.amount)} className="text-xs text-muted-foreground" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export type SliceItem = {
  label: string;
  value: number;
  symbol?: string | null;
  name?: string | null;
  logoName?: string | null;
  kind?: "merchant" | "institution" | "security" | "crypto";
  src?: string | null;
};

export function SliceBreakdownDialog({
  open,
  title,
  rows,
  onClose,
}: {
  open: boolean;
  title: string;
  rows: SliceItem[];
  onClose: () => void;
}) {
  const list = [...rows].filter((r) => Math.abs(r.value) >= MIN_BREAKDOWN).sort((a, b) => b.value - a.value);
  const total = list.reduce((s, r) => s + r.value, 0);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="mb-3 text-sm text-muted-foreground">
          {list.length} items · <Money value={total} />
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in this slice.</p>
        ) : (
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {list.map((r, i) => {
              const kind = r.kind ?? (r.symbol ? "security" : "institution");
              return (
                <li key={`${r.label}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                  <BrandLabel
                    className="min-w-0"
                    kind={kind}
                    symbol={kind === "institution" ? null : r.symbol}
                    name={r.logoName ?? r.name ?? r.label}
                    src={r.src}
                  >
                    <span className="truncate">{r.label}</span>
                  </BrandLabel>
                  <span className="shrink-0 num">
                    <Money value={r.value} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
