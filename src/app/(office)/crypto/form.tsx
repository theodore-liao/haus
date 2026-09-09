"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ownerOptions } from "@/lib/owners";

export function AddWallet({
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
        Add wallet
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add wallet</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Paste a Bitcoin address or xpub/zpub, a Cosmos (cosmos1…) address, a Sui or EVM 0x address, Solana, or
            TRON. Haus reads wallet balances and DeFi positions from public explorers, then prices them on CoinGecko.
          </p>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const fd = new FormData(e.currentTarget);
              try {
                const res = await fetch("/api/crypto-wallets", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    address: fd.get("address"),
                    label: fd.get("label") || null,
                    owner: fd.get("owner"),
                  }),
                });
                const data = await res.json();
                if (!res.ok) toast.error(data.error ?? "Could not add wallet.");
                else {
                  toast.success("Wallet added.");
                  setOpen(false);
                  router.refresh();
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            <div>
              <Label>Wallet address</Label>
              <Input
                className="mt-1 font-mono"
                name="address"
                placeholder="cosmos1… / xpub… / 0x… / bc1…"
                required
              />
            </div>
            <div>
              <Label>Label (optional)</Label>
              <Input className="mt-1" name="label" placeholder="Cold wallet" />
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
            <Button type="submit" disabled={busy}>
              {busy ? "Reading chain…" : "Add wallet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function WalletActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await fetch("/api/crypto-wallets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "sync", id }),
            });
            const data = await res.json();
            if (!res.ok) toast.error(data.error ?? "Sync failed.");
            else {
              toast.success("Wallet synced.");
              router.refresh();
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Syncing…" : "Sync"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          await fetch("/api/crypto-wallets", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          router.refresh();
        }}
      >
        Remove
      </Button>
    </div>
  );
}

export function SyncAllWallets() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/crypto-wallets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "sync" }),
          });
          const data = await res.json();
          if (!res.ok) toast.error(data.error ?? "Sync failed.");
          else {
            toast.success("Wallets synced.");
            router.refresh();
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Syncing…" : "Sync wallets"}
    </Button>
  );
}
