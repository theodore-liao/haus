"use client";

import { useEffect, useState } from "react";
import { ChevronRight, StickyNote } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Money } from "./money";
import { BrandLabel } from "./brand-mark";
import { CategoryIcon, hasCategoryIcon } from "@/lib/category-icons";
import { categoryLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { MerchantLine } from "@/lib/merchant-lines";
import type { TxnRow } from "@/lib/txn-row";
import { cn } from "@/lib/utils";

const MIN_BREAKDOWN = 10;

export function CategoryMerchantDialog({
  open,
  title,
  lines,
  onClose,
  note,
  onOpenTxn,
  positiveAmounts,
}: {
  open: boolean;
  title: string;
  lines: MerchantLine[];
  onClose: () => void;
  note?: string;
  onOpenTxn?: (txn: TxnRow) => void;
  /** Spending breakdown shows outflows as positive amounts. */
  positiveAmounts?: boolean;
}) {
  const rows = [...lines].sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const expandable = rows.some((r) => r.txns);
  const [openMerchants, setOpenMerchants] = useState<Set<string>>(new Set());
  useEffect(() => {
    setOpenMerchants(new Set());
  }, [title, open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={expandable ? "max-w-4xl" : "max-w-xl"}
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
          {rows.length} merchants · <Money value={positiveAmounts ? Math.abs(total) : total} signed={!positiveAmounts && total < 0} />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions in this window.</p>
        ) : (
          <ul className="space-y-2 pr-1">
            {rows.map((r, i) => {
              const key = r.merchant;
              const expanded = openMerchants.has(key);
              const txns = [...(r.txns ?? [])].sort((a, b) => b.date.localeCompare(a.date));
              return (
                <li key={`${r.merchant}-${r.amount}-${i}`} className="text-sm">
                  {r.txns ? (
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 text-left"
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
                        <BrandLabel className="min-w-0" kind="merchant" name={r.merchant}>
                          <span className="truncate">{r.merchant}</span>
                        </BrandLabel>
                      </span>
                      <span className="shrink-0 num">
                        <Money value={positiveAmounts ? Math.abs(r.amount) : r.amount} signed={!positiveAmounts && r.amount < 0} />
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <BrandLabel className="min-w-0" kind="merchant" name={r.merchant}>
                        <span className="truncate">{r.merchant}</span>
                      </BrandLabel>
                      <span className="shrink-0 num">
                        <Money value={positiveAmounts ? Math.abs(r.amount) : r.amount} signed={!positiveAmounts && r.amount < 0} />
                      </span>
                    </div>
                  )}
                  {expanded ? (
                    txns.length === 0 ? (
                      <p className="py-2 pl-6 text-xs text-muted-foreground">No individual transactions in this window.</p>
                    ) : (
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
                    )
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
