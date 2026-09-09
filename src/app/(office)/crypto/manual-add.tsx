"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/money";
import { BrandLabel } from "@/components/brand-mark";
import { lotValue } from "@/lib/crypto-lots";
import { ownerOptions } from "@/lib/owners";
import { RemoveCrypto } from "@/components/add-crypto";

export function ManualAddBox({
  names,
  manuals,
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
  manuals: {
    id: string;
    symbol: string;
    name: string;
    quantity: number;
    quotePrice: number | null;
    notes?: string | null;
  }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const total = manuals.reduce((s, c) => s + lotValue(c), 0);

  return (
    <Card className="h-full border-dashed">
      <CardHeader>
        <CardTitle className="text-sm font-medium normal-case tracking-normal text-foreground">Manual add</CardTitle>
        <p className="text-sm text-muted-foreground">Coins that are not in a linked wallet. USD is priced on CoinGecko.</p>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-medium font-mono tabular-nums">
          <Money value={total} />
        </div>
        <form
          className="mt-3 grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const form = e.currentTarget;
            const fd = new FormData(form);
            const notes = String(fd.get("notes") || "").trim();
            try {
              const res = await fetch("/api/manual-holdings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  symbol: fd.get("symbol"),
                  quantity: Number(fd.get("quantity")),
                  notes: notes || undefined,
                  owner: fd.get("owner"),
                }),
              });
              const data = await res.json();
              if (!res.ok) toast.error(data.error ?? "Could not save.");
              else {
                toast.success(`${data.row?.symbol ?? "Coin"} added.`);
                form.reset();
                router.refresh();
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Symbol</Label>
              <Input className="mt-1" name="symbol" placeholder="BTC" required />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input className="mt-1" name="quantity" type="number" step="any" required />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Input className="mt-1" name="notes" placeholder="Hardware wallet, gift, leftover from Coinbase…" />
          </div>
          <div>
            <Label>Owner</Label>
            <select name="owner" className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm">
              {ownerOptions(names).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Looking up…" : "Add holding"}
          </Button>
        </form>
        {manuals.length > 0 ? (
          <ul className="mt-4 max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {manuals.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                <BrandLabel className="min-w-0" kind="crypto" symbol={c.symbol} name={c.name}>
                  <span className="min-w-0 truncate">
                    {c.symbol}
                    <span className="ml-1 text-muted-foreground">{c.quantity}</span>
                    {c.notes ? <span className="ml-1 text-muted-foreground">· {c.notes}</span> : null}
                  </span>
                </BrandLabel>
                <span className="flex shrink-0 items-center gap-2 font-mono tabular-nums">
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
