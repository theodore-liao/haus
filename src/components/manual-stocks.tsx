"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ownerOptions } from "@/lib/owners";
import { FIXED_USD_ID } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type ManualStock = {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  quotePrice: number | null;
  quoteChange?: number | null;
  quoteChangePct?: number | null;
  coingeckoId: string | null;
  notes?: string | null;
  assetClass: string;
  accountName: string;
  owner: string;
  ownerLabel: string;
  costBasis?: number | null;
  updatedAt?: string | null;
};

function lotValue(c: ManualStock) {
  if (c.coingeckoId === FIXED_USD_ID) return c.quotePrice ?? 0;
  return (c.quotePrice ?? 0) * c.quantity;
}

export function ManualEntryControls({
  names,
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
}) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ManualStock | null>(null);
  return (
    <>
      <Button
        type="button"
        size="sm"
        className="cursor-pointer"
        onClick={() => {
          setEdit(null);
          setOpen(true);
        }}
      >
        Add manual entry
      </Button>
      <ManualStockFormDialog names={names} existing={edit} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function ManualStockFormDialog({
  names,
  existing,
  open,
  onOpenChange,
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
  existing?: ManualStock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"shares" | "value">("shares");
  const syncKey = open ? (existing?.id ?? "new") : "closed";
  const [seen, setSeen] = useState(syncKey);
  if (seen !== syncKey) {
    setSeen(syncKey);
    if (syncKey !== "closed") setMode(existing?.coingeckoId === FIXED_USD_ID ? "value" : "shares");
  }
  const perShare =
    existing && existing.coingeckoId !== FIXED_USD_ID && existing.costBasis != null && existing.quantity
      ? String(Number((existing.costBasis / existing.quantity).toFixed(6)))
      : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit manual entry" : "Add manual entry"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("shares")}
            className={cn(
              "cursor-pointer rounded-lg border p-3 text-left",
              mode === "shares" ? "border-foreground bg-secondary" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="block text-sm font-medium text-foreground">Ticker + shares</span>
            <span className="mt-1 block text-xs">Priced from a live quote. Cost basis is per share.</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("value")}
            className={cn(
              "cursor-pointer rounded-lg border p-3 text-left",
              mode === "value" ? "border-foreground bg-secondary" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="block text-sm font-medium text-foreground">Name + dollar value</span>
            <span className="mt-1 block text-xs">A fixed amount you type in. Cost basis is the total you paid.</span>
          </button>
        </div>
        <form
          key={`${syncKey}:${mode}`}
          className="mt-4 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const form = e.currentTarget;
            const fd = new FormData(form);
            const notes = String(fd.get("notes") || "").trim();
            const optional = (key: string) => {
              const raw = String(fd.get(key) ?? "").trim();
              if (!raw) return null;
              const n = Number(raw);
              return Number.isFinite(n) && n >= 0 ? n : null;
            };
            const meta = {
              id: existing?.id,
              assetClass: String(fd.get("assetClass") || "equity"),
              accountName: String(fd.get("accountName") || "").trim(),
              owner: String(fd.get("owner") || ""),
              notes: notes || undefined,
            };
            const body =
              mode === "shares"
                ? {
                    mode: "shares" as const,
                    symbol: fd.get("symbol"),
                    quantity: Number(fd.get("quantity")),
                    costPerShare: optional("costPerShare"),
                    ...meta,
                  }
                : {
                    mode: "value" as const,
                    name: fd.get("name"),
                    value: Number(fd.get("value")),
                    costBasis: optional("costBasis"),
                    ...meta,
                  };
            try {
              const res = await fetch("/api/manual-stocks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) toast.error(data.error ?? "Could not save.");
              else {
                toast.success(existing ? "Manual holding updated." : "Manual holding added.");
                onOpenChange(false);
                router.refresh();
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "shares" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Ticker</Label>
                <Input className="mt-1" name="symbol" placeholder="AAPL" required defaultValue={existing?.coingeckoId === FIXED_USD_ID ? undefined : existing?.symbol} />
              </div>
              <div>
                <Label>Shares</Label>
                <Input
                  className="mt-1"
                  name="quantity"
                  type="number"
                  step="any"
                  min="0"
                  required
                  defaultValue={existing?.coingeckoId === FIXED_USD_ID ? undefined : existing?.quantity}
                />
              </div>
              <div>
                <Label>Cost / share</Label>
                <Input className="mt-1" name="costPerShare" type="number" step="any" min="0" placeholder="Optional" defaultValue={perShare} />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <Label>Name</Label>
                <Input
                  className="mt-1"
                  name="name"
                  placeholder="Private company, RSUs, note…"
                  required
                  defaultValue={existing?.name}
                />
              </div>
              <div>
                <Label>Value (USD)</Label>
                <Input
                  className="mt-1"
                  name="value"
                  type="number"
                  step="any"
                  min="0"
                  required
                  defaultValue={existing ? lotValue(existing) : undefined}
                />
              </div>
              <div>
                <Label>Cost basis</Label>
                <Input
                  className="mt-1"
                  name="costBasis"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Total paid"
                  defaultValue={existing?.costBasis ?? undefined}
                />
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Type</Label>
              <select
                name="assetClass"
                className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
                defaultValue={existing?.assetClass || "equity"}
              >
                <option value="equity">Equity</option>
                <option value="etf">ETF</option>
              </select>
            </div>
            <div>
              <Label>Account</Label>
              <Input className="mt-1" name="accountName" placeholder="Brokerage, ESPP…" required defaultValue={existing?.accountName} />
            </div>
            <div>
              <Label>Account holder</Label>
              <select
                name="owner"
                className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
                defaultValue={existing?.owner}
              >
                {ownerOptions(names, existing?.owner).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" className="h-9" disabled={busy}>
              {busy ? "Saving…" : existing ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
