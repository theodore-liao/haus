"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ownerOptions } from "@/lib/owners";

export function AddCrypto({
  names,
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add crypto
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent persist>
          <DialogHeader>
            <DialogTitle>Self-custody crypto</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Coins not held at a linked exchange. Price updates from CoinGecko on refresh.
          </p>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const fd = new FormData(e.currentTarget);
              const costRaw = String(fd.get("costBasis") || "");
              try {
                const res = await fetch("/api/manual-holdings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    symbol: fd.get("symbol"),
                    quantity: Number(fd.get("quantity")),
                    costBasis: costRaw ? Number(costRaw) : null,
                    owner: fd.get("owner"),
                  }),
                });
                const data = await res.json();
                if (!res.ok) toast.error(data.error ?? "Could not save.");
                else {
                  toast.success(`${data.row?.symbol ?? "Coin"} added.`);
                  setOpen(false);
                  router.refresh();
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            <div>
              <Label>Symbol</Label>
              <Input className="mt-1" name="symbol" placeholder="BTC" required />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input className="mt-1" name="quantity" type="number" step="any" required />
            </div>
            <div>
              <Label>Cost basis (USD, optional)</Label>
              <Input className="mt-1" name="costBasis" type="number" step="any" />
            </div>
            <div>
              <Label>Holder</Label>
              <select name="owner" className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm">
                {ownerOptions(names).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RemoveCrypto({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="cursor-pointer text-[11px] text-muted-foreground hover:text-negative"
      onClick={async () => {
        await fetch("/api/manual-holdings", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        router.refresh();
      }}
    >
      Remove
    </button>
  );
}
