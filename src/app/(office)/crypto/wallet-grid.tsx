"use client";

import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Money, HeroMetric } from "@/components/money";
import { ObjectTitle, OwnerTag, kickerClass } from "@/components/type";
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
  brokerage?: boolean;
  assets: {
    id: string;
    chain: string;
    tokenKey?: string;
    symbol: string;
    name: string;
    quantity: number;
    quotePrice: number | null;
    logo?: string | null;
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
      className="mb-4 xl:grid-cols-3"
      extra={<ManualAddBox names={names} manuals={manuals} />}
      render={(w, handle) => {
        const chains = [...new Set(w.assets.map((a) => a.chain))];
        const chainLabels = [...new Set(chains.map((c) => CHAIN_META[c]?.label ?? c))];
        const explorer = CHAIN_META[w.addressType === "evm" ? "ethereum" : w.addressType]?.explorer(w.address);
        const brand = w.brokerage
          ? { kind: "institution" as const, symbol: null as string | null, src: undefined as string | undefined, name: w.label || "Brokerage" }
          : chainBrand(w.addressType, chains);
        const holdings = w.assets
          .filter((a) => lotValue(a) >= 10)
          .slice()
          .sort((a, b) => lotValue(b) - lotValue(a));
        const tokens = holdings.filter((a) => !isDefiAsset(a));
        const defi = holdings.filter((a) => isDefiAsset(a));
        const shownValue = holdings.reduce((s, a) => s + lotValue(a), 0);
        // Every card has the same rows in the same order (title, value, address line, two facts, fixed-height
        // holdings) so the grid reads as a set of identical tiles regardless of wallet contents.
        return (
          <Card className="flex h-full flex-col">
            <CardHeader row className="flex-nowrap items-start">
              <div className="min-w-0">
                <ObjectTitle
                  title={`${w.label || shortAddress(w.address)} - ${w.ownerLabel}`}
                  className="flex items-center gap-2"
                >
                  <BrandMark kind={brand.kind} symbol={brand.symbol} src={brand.src} name={brand.name} />
                  <span className="truncate">{w.label || shortAddress(w.address)}</span>
                  <OwnerTag className="ml-0">{w.ownerLabel}</OwnerTag>
                </ObjectTitle>
              </div>
              <div className="flex shrink-0 items-start gap-1">
                {w.brokerage ? null : <WalletActions id={w.id} />}
                {handle}
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <HeroMetric label="Value">
                <Money value={shownValue} />
              </HeroMetric>
              <div className="footnote mt-2 flex h-5 items-center gap-2">
                {w.brokerage ? (
                  <span>Brokerage custody</span>
                ) : (
                  <>
                    <span className="num min-w-0 truncate">
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
                    {revealed[w.id] && explorer ? (
                      <a href={explorer} target="_blank" rel="noreferrer" className="shrink-0 text-primary">
                        Explorer
                      </a>
                    ) : null}
                  </>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Field k={w.brokerage ? "Custody" : "Chains"} v={w.brokerage ? "Brokerage" : chainLabels.length ? chainLabels.join(", ") : "—"} />
                <Field k="Last sync" v={formatDateTime(w.lastSyncedAt)} />
              </div>
              {w.lastError ? <p className="mt-2 text-sm text-negative">{w.lastError}</p> : null}
              {defi.length ? (
                <Tabs defaultValue="tokens" className="mt-3 flex flex-1 flex-col">
                  <TabsList className="min-h-8">
                    <TabsTrigger value="tokens" className="px-2 py-0.5 text-xs">
                      Tokens ({tokens.length})
                    </TabsTrigger>
                    <TabsTrigger value="defi" className="px-2 py-0.5 text-xs">
                      DeFi ({defi.length})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="tokens" className="mt-2 flex-1">
                    <HoldingList rows={tokens} />
                  </TabsContent>
                  <TabsContent value="defi" className="mt-2 flex-1">
                    <HoldingList rows={defi} />
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="mt-3 flex-1">
                  <HoldingList rows={tokens} />
                </div>
              )}
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
    return <p className="flex h-44 items-center justify-center text-sm text-muted-foreground">No balances found on supported chains.</p>;
  }
  return (
    <ul className="h-44 space-y-1.5 overflow-y-auto pr-1">
      {rows.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
          <BrandLabel className="min-w-0" kind="crypto" symbol={a.symbol} name={a.name} src={a.logo}>
            <span className="truncate">
              {a.symbol}
              <span className="ml-1 text-muted-foreground">{a.name}</span>
            </span>
          </BrandLabel>
          <span className="shrink-0 num">
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
      <div className={kickerClass}>{k}</div>
      <div>{v}</div>
    </div>
  );
}
