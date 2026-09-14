"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Money } from "./money";
import { BrandLabel } from "./brand-mark";
import { CategoryIcon, hasCategoryIcon } from "@/lib/category-icons";

export type MerchantLine = { category: string; merchant: string; amount: number };

const MIN_BREAKDOWN = 10;

export function CategoryMerchantDialog({
  open,
  title,
  lines,
  onClose,
  note,
}: {
  open: boolean;
  title: string;
  lines: MerchantLine[];
  onClose: () => void;
  note?: string;
}) {
  const rows = [...lines].sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasCategoryIcon(title) ? <CategoryIcon category={title} className="h-4 w-4" /> : null}
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="mb-3 text-sm text-muted-foreground">
          {note ? <p className="mb-2">{note}</p> : null}
          {rows.length} merchants · <Money value={total} />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions in this window.</p>
        ) : (
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <li key={`${r.merchant}-${r.amount}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                <BrandLabel className="min-w-0" kind="merchant" name={r.merchant}>
                  <span className="truncate">{r.merchant}</span>
                </BrandLabel>
                <span className="shrink-0 font-mono tabular-nums">
                  <Money value={r.amount} signed={r.amount < 0} />
                </span>
              </li>
            ))}
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
  kind?: "merchant" | "institution" | "security" | "crypto";
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
                  <BrandLabel className="min-w-0" kind={kind} symbol={r.symbol} name={r.name ?? r.label}>
                    <span className="truncate">{r.label}</span>
                  </BrandLabel>
                  <span className="shrink-0 font-mono tabular-nums">
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

export function aggregateMerchants(lines: MerchantLine[], category: string | null, extras?: string[]) {
  const allow = category == null ? null : new Set([category, ...(extras ?? [])]);
  const map: Record<string, number> = {};
  for (const l of lines) {
    if (allow && !allow.has(l.category)) continue;
    map[l.merchant] = (map[l.merchant] ?? 0) + l.amount;
  }
  return Object.entries(map).map(([merchant, amount]) => ({ category: category ?? "All", merchant, amount }));
}
