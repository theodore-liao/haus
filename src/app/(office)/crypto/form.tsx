"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmButton } from "@/components/confirm-button";
import { InfoTip } from "@/components/info-tip";
import { ownerOptions } from "@/lib/owners";
import { shortAddress } from "@/lib/onchain";

export function AddWallet({
  names,
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button type="button" size="sm" onClick={() => { setError(null); setOpen(true); }}>
        Add wallet
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add wallet</DialogTitle>
          </DialogHeader>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            Paste a wallet address from Bitcoin, Ethereum, Solana and other major chains.
            <InfoTip label="Supported wallets">
              Bitcoin, Litecoin and Dogecoin addresses (or a BTC xpub/zpub), EVM 0x addresses or ENS names (Ethereum, Base,
              Arbitrum, Optimism, Polygon, BNB Chain, Avalanche and more), Solana, TRON, Sui and Cosmos (cosmos1…). Balances
              and DeFi positions come from public explorers, priced on CoinGecko.
            </InfoTip>
          </p>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
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
                if (!res.ok) {
                  const msg = data.error ?? "Could not add wallet.";
                  setError(msg);
                  toast.error(msg);
                } else {
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
                placeholder="0x… / bc1… / ltc1… / xpub…"
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "wallet-address-error" : undefined}
                onChange={() => setError(null)}
              />
              {error ? (
                <p id="wallet-address-error" role="alert" className="mt-1 text-sm text-negative">
                  {error}
                </p>
              ) : null}
            </div>
            <div>
              <Label>Label (optional)</Label>
              <Input className="mt-1" name="label" placeholder="Cold wallet" />
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
              {busy ? "Reading chain…" : "Add wallet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RenameWallet({
  id,
  address,
  label,
}: {
  id: string;
  address: string;
  label: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label ?? "");
  const [busy, setBusy] = useState(false);
  const display = label || shortAddress(address);

  async function save() {
    const next = value.trim();
    const prev = (label ?? "").trim();
    if (next === prev) {
      setEditing(false);
      setValue(label ?? "");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/crypto-wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", id, label: next || null }),
      });
      const data = await res.json();
      if (!res.ok) toast.error(data.error ?? "Could not rename wallet.");
      else {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Input
        autoFocus
        aria-label="Wallet name"
        className="h-7 min-w-0 flex-1 max-w-[12rem] text-sm"
        value={value}
        disabled={busy}
        placeholder={shortAddress(address)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          void save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          }
          if (e.key === "Escape") {
            setValue(label ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{display}</span>
      <button
        type="button"
        className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
        aria-label="Rename wallet"
        onClick={() => {
          setValue(label ?? "");
          setEditing(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </span>
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
      <ConfirmButton
        title="Remove this wallet?"
        description="Its balances leave your crypto total."
        onConfirm={async () => {
          try {
            const res = await fetch("/api/crypto-wallets", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              toast.error(data.error ?? "Could not remove wallet.");
              return;
            }
            router.refresh();
          } catch {
            toast.error("Could not remove wallet.");
          }
        }}
      >
        Remove
      </ConfirmButton>
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
