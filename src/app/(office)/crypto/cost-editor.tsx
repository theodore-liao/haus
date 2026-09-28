"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Delta, Money } from "@/components/money";
import { BrandMark } from "@/components/brand-mark";

export type CostCoin = {
  symbol: string;
  name: string;
  quantity: number;
  value: number;
  avgCost: number | null;
  logo: string | null;
};

/** Dollars with commas: two decimals at $1 and up, more for coins that trade below a dollar. */
function formatCost(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n >= 1 ? 2 : 6 });
}

function parseCost(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  return raw.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n;
}

/** Average cost per coin for wallet and brokerage crypto, so the page can show cost and gain. */
export function CryptoCostEditor({ coins }: { coins: CostCoin[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  function start() {
    setDraft(Object.fromEntries(coins.map((c) => [c.symbol, c.avgCost != null ? formatCost(c.avgCost) : ""])));
    setOpen(true);
  }

  async function save() {
    const costs = coins.map((c) => ({ symbol: c.symbol, avgCost: parseCost(draft[c.symbol] ?? "") }));
    setBusy(true);
    try {
      const res = await fetch("/api/crypto-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costs }),
      });
      if (!res.ok) {
        toast.error("Could not save average costs.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={start}>
        Average cost
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="flex max-h-[min(90vh,720px)] max-w-2xl flex-col">
          <DialogHeader>
            <DialogTitle>Average cost</DialogTitle>
            <DialogDescription>
              Enter what you paid per coin on average. Leave a coin blank to skip it. Manual entries keep their own cost.
            </DialogDescription>
          </DialogHeader>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {coins.map((c) => {
              const avg = parseCost(draft[c.symbol] ?? "");
              const cost = avg != null ? avg * c.quantity : null;
              const gain = cost != null ? c.value - cost : null;
              return (
                <li key={c.symbol} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
                  <div className="flex min-w-0 items-center gap-2">
                    <BrandMark kind="crypto" symbol={c.symbol} name={c.name} src={c.logo ?? undefined} />
                    <div className="min-w-0">
                      <div className="truncate text-sm">{c.symbol}</div>
                      <div className="footnote truncate">
                        <span className="num">{c.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span> ·{" "}
                        <Money value={c.value} />
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-1 text-sm">
                    <span className="text-muted-foreground">$</span>
                    <Input
                      inputMode="decimal"
                      aria-label={`Average cost per ${c.symbol}`}
                      className="num h-8 text-right"
                      placeholder="—"
                      value={draft[c.symbol] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [c.symbol]: e.target.value }))}
                      onBlur={() => {
                        const n = parseCost(draft[c.symbol] ?? "");
                        setDraft((d) => ({ ...d, [c.symbol]: n != null ? formatCost(n) : "" }));
                      }}
                    />
                  </label>
                  <div className="col-span-2 text-right text-sm sm:col-span-1">
                    {cost != null ? (
                      <>
                        <div className="footnote">
                          Cost <Money value={cost} />
                        </div>
                        <Delta value={gain} pct={cost > 0 && gain != null ? (gain / cost) * 100 : null} className="text-sm" />
                      </>
                    ) : (
                      <span className="footnote">No cost</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
