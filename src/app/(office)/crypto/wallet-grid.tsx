"use client";

import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { BrandLabel, BrandMark } from "@/components/brand-mark";
import { CHAIN_META, isDefiAsset, shortAddress } from "@/lib/onchain";
import { lotValue } from "@/lib/crypto-lots";
import { formatDateTime } from "@/lib/format";
import { chainBrand } from "@/lib/logos";
import { SortableGrid, useStoredOrder } from "@/components/sortable-grid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, EyeOff } from "lucide-react";
import { WalletActions } from "./form";
import { ManualAddBox } from "./manual-add";

export type WalletCard = {
  id: string;
  address: string;
  addressType: string;
  label: string | null;
  ownerLabel: string;
  lastSyncedAt: Date | string | null;
  lastError: string | null;
  assets: {
    id: string;
    chain: string;
    tokenKey?: string;
    symbol: string;
    name: string;
    quantity: number;
    quotePrice: number | null;
  }[];
};

export function WalletGrid({
  wallets,
  names,
  manuals,
}: {
  wallets: WalletCard[];
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
  const [ordered, reorder] = useStoredOrder("haus.cryptoWalletOrder", wallets);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  return (
    <SortableGrid
      items={ordered}
      onReorder={reorder}
      className="mb-4"
      extra={<ManualAddBox names={names} manuals={manuals} />}
      render={(w, handle) => {
        const chains = [...new Set(w.assets.map((a) => a.chain))];
        const chainLabels = [...new Set(chains.map((c) => CHAIN_META[c]?.label ?? c))];
        const explorer = CHAIN_META[w.addressType === "evm" ? "ethereum" : w.addressType]?.explorer(w.address);
        const brand = chainBrand(w.addressType, chains);
        const holdings = w.assets
          .filter((a) => lotValue(a) >= 10)
          .slice()
          .sort((a, b) => lotValue(b) - lotValue(a));
        const tokens = holdings.filter((a) => !isDefiAsset(a));
        const defi = holdings.filter((a) => isDefiAsset(a));
        const shownValue = holdings.reduce((s, a) => s + lotValue(a), 0);
        return (
          <Card className="h-full">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 truncate text-sm font-medium normal-case tracking-normal text-foreground">
                  <BrandMark kind={brand.kind} symbol={brand.symbol} src={brand.src} name={brand.name} />
                  <span className="truncate">{w.label || shortAddress(w.address)}</span>
                </CardTitle>
                <div className="mt-1 text-sm text-muted-foreground">{w.ownerLabel}</div>
              </div>
              <div className="flex shrink-0 items-start gap-1">
                <WalletActions id={w.id} />
                {handle}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-medium font-mono tabular-nums">
                <Money value={shownValue} />
              </div>
              <div className="mt-2 flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
                <span className="min-w-0 break-all">
                  {revealed[w.id] ? w.address : shortAddress(w.address)}
                </span>
                <button
                  type="button"
                  className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                  aria-label={revealed[w.id] ? "Hide address" : "Show address"}
                  onClick={() => setRevealed((s) => ({ ...s, [w.id]: !s[w.id] }))}
                >
                  {revealed[w.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {revealed[w.id] && explorer ? (
                <a href={explorer} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] text-primary">
                  Open explorer
                </a>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Field k="Chains" v={chainLabels.length ? chainLabels.join(", ") : "—"} />
                <Field k="Last sync" v={formatDateTime(w.lastSyncedAt)} />
              </div>
              {w.lastError ? <p className="mt-2 text-sm text-negative">{w.lastError}</p> : null}
              {tokens.length || defi.length ? (
                defi.length ? (
                  <Tabs defaultValue="tokens" className="mt-3">
                    <TabsList className="h-8">
                      <TabsTrigger value="tokens" className="px-2 py-0.5 text-[12px]">
                        Tokens ({tokens.length})
                      </TabsTrigger>
                      <TabsTrigger value="defi" className="px-2 py-0.5 text-[12px]">
                        DeFi ({defi.length})
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="tokens" className="mt-2">
                      <HoldingList rows={tokens} />
                    </TabsContent>
                    <TabsContent value="defi" className="mt-2">
                      <HoldingList rows={defi} />
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="mt-3">
                    <HoldingList rows={tokens} />
                  </div>
                )
              ) : null}
            </CardContent>
          </Card>
        );
      }}
    />
  );
}

function HoldingList({
  rows,
}: {
  rows: WalletCard["assets"];
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">Nothing in this tab.</p>;
  }
  return (
    <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
      {rows.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
          <BrandLabel className="min-w-0" kind="crypto" symbol={a.symbol} name={a.name}>
            <span className="truncate">
              {a.symbol}
              <span className="ml-1 text-muted-foreground">{a.name}</span>
            </span>
          </BrandLabel>
          <span className="shrink-0 font-mono tabular-nums">
            <Money value={lotValue(a)} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Field({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{k}</div>
      <div>{v}</div>
    </div>
  );
}
