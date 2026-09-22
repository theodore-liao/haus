"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/money";
import { BrandLabel } from "@/components/brand-mark";
import { OwnerTag } from "@/components/type";
import { ownerOptions } from "@/lib/owners";
import { RemoveCrypto } from "@/components/add-crypto";
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

export function ManualStockBox({
  names,
  rows,
  showList = true,
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
  rows: ManualStock[];
  showList?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"shares" | "value">("shares");
  const total = rows.reduce((s, c) => s + lotValue(c), 0);

  const addBtn =
    adding ? (
      <Button type="button" size="sm" variant="ghost" className="cursor-pointer" onClick={() => setAdding(false)}>
        Cancel
      </Button>
    ) : (
      <Button type="button" size="sm" className="cursor-pointer" onClick={() => setAdding(true)}>
        Add holdings
      </Button>
    );

  if (!showList) {
    return (
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="cursor-pointer" asChild>
          <a href="/connections">Add connection</a>
        </Button>
        <Button type="button" size="sm" className="cursor-pointer" onClick={() => setAdding(true)}>
          Add holdings
        </Button>
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add holdings</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Ticker lots are priced live; named lots use the dollar amount you enter.</p>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <Card className="relative z-0 mb-4">
      <CardHeader row className="flex-nowrap items-start">
        <div>
          <CardTitle>Manual Entries</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Positions not in a linked brokerage. Ticker lots are priced live; named lots use the dollar amount you enter.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-3xl font-medium num leading-none">
            <Money value={total} />
          </div>
          {adding ? (
            <Button type="button" size="sm" variant="ghost" className="cursor-pointer" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          ) : (
            <Button type="button" size="sm" className="cursor-pointer" onClick={() => setAdding(true)}>
              Add holdings
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {adding ? (
          <>
        <div className="mb-3 flex rounded-md border border-border p-0.5">
          {(
            [
              ["shares", "Ticker + shares"],
              ["value", "Name + dollar value"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className={cn(
                "cursor-pointer flex-1 rounded px-2 py-1 text-[12px]",
                mode === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          className="grid gap-2 md:grid-cols-6 md:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const form = e.currentTarget;
            const fd = new FormData(form);
            const notes = String(fd.get("notes") || "").trim();
            const meta = {
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
                    ...meta,
                  }
                : {
                    mode: "value" as const,
                    name: fd.get("name"),
                    value: Number(fd.get("value")),
                    ...meta,
                  };
            try {
              const res = await fetch("/api/manual-stocks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              const data = await res.json();
              if (!res.ok) toast.error(data.error ?? "Could not save.");
              else {
                toast.success("Manual holding added.");
                form.reset();
                router.refresh();
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "shares" ? (
            <>
              <div>
                <Label>Ticker</Label>
                <Input className="mt-1" name="symbol" placeholder="AAPL" required />
              </div>
              <div>
                <Label>Shares</Label>
                <Input className="mt-1" name="quantity" type="number" step="any" min="0" required />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>Name</Label>
                <Input className="mt-1" name="name" placeholder="Private company, RSUs, note…" required />
              </div>
              <div>
                <Label>Value (USD)</Label>
                <Input className="mt-1" name="value" type="number" step="any" min="0" required />
              </div>
            </>
          )}
          <div>
            <Label>Type</Label>
            <select name="assetClass" className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm" defaultValue="equity">
              <option value="equity">Equity</option>
              <option value="etf">ETF</option>
            </select>
          </div>
          <div>
            <Label>Account</Label>
            <Input className="mt-1" name="accountName" placeholder="Brokerage, ESPP…" required />
          </div>
          <div>
            <Label>Account holder</Label>
            <select name="owner" className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm">
              {ownerOptions(names).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="h-9 w-full md:w-auto" disabled={busy}>
            {busy ? "Saving…" : "Add"}
          </Button>
        </form>
          </>
        ) : null}
        {rows.length > 0 ? (
          <ul className={cn("space-y-1.5", adding && "mt-4")}>
            {rows.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                <BrandLabel className="min-w-0" kind="security" symbol={c.coingeckoId === FIXED_USD_ID ? null : c.symbol} name={c.name}>
                  <span className="min-w-0 truncate">
                    {c.coingeckoId === FIXED_USD_ID ? c.name : `${c.symbol} · ${c.name}`}
                    {c.coingeckoId === FIXED_USD_ID ? null : (
                      <span className="ml-1 text-muted-foreground">{c.quantity} sh</span>
                    )}
                    <span className="ml-1 text-muted-foreground">
                      · {c.assetClass === "etf" ? "ETF" : "Equity"} · {c.accountName}
                    </span>
                    <OwnerTag>{c.ownerLabel}</OwnerTag>
                    {c.notes ? <span className="ml-1 text-muted-foreground">· {c.notes}</span> : null}
                  </span>
                </BrandLabel>
                <span className="flex shrink-0 items-center gap-2 num">
                  <Money value={lotValue(c)} />
                  <RemoveCrypto id={c.id} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ManualEntryControls({
  names,
  rows,
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
  rows: ManualStock[];
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
              const data = await res.json();
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
                {ownerOptions(names).map((o) => (
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
