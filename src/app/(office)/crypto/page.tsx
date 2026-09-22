import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Money } from "@/components/money";
import { HeroCard } from "@/components/hero-card";
import { prisma } from "@/lib/db";
import { getBrokerageCrypto, getNames, getOverview } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { matchesOwner, ownerLabel } from "@/lib/owners";
import { CHAIN_META, collapseDuplicateSpot, isDefiAsset, shortAddress } from "@/lib/onchain";
import { lotValue } from "@/lib/crypto-lots";
import { InvestmentsBoard, type HoldingRow } from "@/components/holdings-table";
import { LargestMoves } from "@/components/largest-moves";
import { AddWallet, SyncAllWallets } from "./form";
import { WalletGrid } from "./wallet-grid";
import { cryptoDayMoves, refreshCryptoQuotes } from "@/lib/quotes";
import { getCryptoLogoMap } from "@/lib/crypto-logos";
import { COINGECKO_IDS } from "@/lib/crypto-assets";

export const dynamic = "force-dynamic";

export default async function CryptoPage() {
  const owner = await getOwnerFilter();
  await refreshCryptoQuotes();

  const [names, allWallets, allManuals, brokerage, overview] = await Promise.all([
    getNames(),
    prisma.cryptoWallet.findMany({ include: { assets: true }, orderBy: { createdAt: "asc" } }),
    prisma.manualHolding.findMany({ where: { kind: "crypto" } }),
    getBrokerageCrypto(owner),
    getOverview(owner),
  ]);
  const wallets = allWallets.filter((w) => matchesOwner(w.owner, owner));
  const manuals = allManuals.filter((c) => matchesOwner(c.owner, owner));

  const geckoId = (symbol: string, id?: string | null) =>
    id ?? COINGECKO_IDS[symbol.trim().toUpperCase().replace(/-USD$/, "")]?.id ?? null;
  const missing = new Set<string>();
  // A stored 0/0 is the old placeholder from a price feed that omitted the 24h move.
  const needsLive = (change: number | null | undefined, pct: number | null | undefined) =>
    change == null || (change === 0 && (pct == null || pct === 0));
  const note = (
    change: number | null | undefined,
    pct: number | null | undefined,
    symbol: string,
    id?: string | null,
  ) => {
    if (!needsLive(change, pct)) return;
    const g = geckoId(symbol, id);
    if (g) missing.add(g);
  };
  for (const w of wallets) for (const a of w.assets) note(a.quoteChange, a.quoteChangePct, a.symbol, a.coingeckoId);
  for (const c of manuals) note(c.quoteChange, c.quoteChangePct, c.symbol, c.coingeckoId);
  for (const g of brokerage) for (const a of g.assets) note(a.quoteChange, a.quoteChangePct, a.symbol);
  const [logos, moves] = await Promise.all([
    getCryptoLogoMap([
      ...wallets.flatMap((w) => w.assets.map((a) => geckoId(a.symbol, a.coingeckoId))),
      ...manuals.map((c) => geckoId(c.symbol, c.coingeckoId)),
      ...brokerage.flatMap((g) => g.assets.map((a) => geckoId(a.symbol))),
    ]),
    cryptoDayMoves([...missing]),
  ]);
  const dayOf = (
    change: number | null | undefined,
    pct: number | null | undefined,
    qty: number,
    symbol: string,
    id?: string | null,
  ) => {
    if (needsLive(change, pct)) {
      const q = moves.get(geckoId(symbol, id) ?? "");
      if (q) return { dayPl: q.change * qty, dayPct: q.changePct };
    }
    if (change != null) return { dayPl: change * qty, dayPct: pct ?? null };
    return { dayPl: null as number | null, dayPct: null as number | null };
  };
  const logoFor = (symbol: string, id?: string | null) => {
    const g = geckoId(symbol, id);
    return g ? logos.get(g) ?? null : null;
  };

  const rows: HoldingRow[] = [];
  for (const w of wallets) {
    const account = w.label || shortAddress(w.address);
    const assets = collapseDuplicateSpot(
      w.assets.map((a) => ({
        chain: a.chain,
        tokenKey: a.tokenKey,
        symbol: a.symbol,
        name: a.name,
        contractAddress: a.contractAddress,
        decimals: a.decimals,
        quantity: a.quantity,
        coingeckoId: a.coingeckoId,
        quotePrice: a.quotePrice,
      })),
    );
    const keep = new Set(assets.map((a) => `${a.chain}:${a.tokenKey}`));
    for (const a of w.assets) {
      if (!keep.has(`${a.chain}:${a.tokenKey}`)) continue;
      const value = lotValue(a);
      if (value < 10) continue;
      const day = dayOf(a.quoteChange, a.quoteChangePct, a.quantity, a.symbol, a.coingeckoId);
      rows.push({
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        class: isDefiAsset(a) ? "DeFi" : (CHAIN_META[a.chain]?.label ?? a.chain),
        account,
        institution: a.chain,
        ownerLabel: ownerLabel(w.owner, names),
        qty: a.quantity,
        last: a.quotePrice,
        value,
        costBasis: null,
        dayPl: day.dayPl,
        totalPl: null,
        dayPct: day.dayPct,
        weight: 0,
        manual: false,
        brandKind: "crypto",
        brandSrc: logoFor(a.symbol, a.coingeckoId),
      });
    }
  }
  for (const g of brokerage) {
    for (const a of g.assets) {
      const day = dayOf(a.quoteChange, a.quoteChangePct, a.quantity, a.symbol);
      rows.push({
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        class: g.institution,
        account: g.institution,
        institution: g.institution,
        ownerLabel: g.ownerLabel,
        qty: a.quantity,
        last: a.quotePrice,
        value: a.value,
        costBasis: null,
        dayPl: day.dayPl,
        totalPl: null,
        dayPct: day.dayPct,
        weight: 0,
        manual: false,
        brandKind: "crypto",
        brandSrc: logoFor(a.symbol),
      });
    }
  }
  for (const c of manuals) {
    const value = lotValue(c);
    const day = dayOf(c.quoteChange, c.quoteChangePct, c.quantity, c.symbol, c.coingeckoId);
    rows.push({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      class: "Manual",
      account: "Entered lot",
      institution: "Self-custody",
      ownerLabel: ownerLabel(c.owner, names),
      qty: c.quantity,
      last: c.quotePrice,
      value,
      costBasis: c.costBasis,
      dayPl: day.dayPl,
      totalPl: c.costBasis != null ? value - c.costBasis : null,
      dayPct: day.dayPct,
      weight: 0,
      manual: true,
      updatedAt: (c.editedAt ?? c.createdAt).toISOString(),
      brandKind: "crypto",
      brandSrc: logoFor(c.symbol, c.coingeckoId),
    });
  }

  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <>
      <PageHeader
        title="Crypto"
        actions={
          <>
            {wallets.length > 0 ? <SyncAllWallets /> : null}
            <AddWallet names={names} />
          </>
        }
      />
      {wallets.length === 0 && manuals.length === 0 && brokerage.length === 0 ? (
        <EmptyLedger
          showConnect={false}
          title="No wallets yet"
          body="Add a wallet address. Haus scans Bitcoin, Ethereum and other EVM chains, Solana, and TRON."
        />
      ) : (
        <HeroCard kicker="Wallet value">
          <Money value={total} />
        </HeroCard>
      )}
      {rows.length > 0 ? (
          <InvestmentsBoard
            rows={rows}
            hideHero
            hideTable
            minValue={10}
            classMode="asset"
            accountSlot={
              <LargestMoves
                movers={overview.movers
                  .filter((m) => m.kind === "crypto")
                  .map((m) => {
                    if (!m.symbol || (m.day.delta != null && m.day.delta !== 0)) return m;
                    const q = moves.get(geckoId(m.symbol) ?? "");
                    if (!q) return m;
                    const qty =
                      brokerage.flatMap((g) => g.assets).find((a) => a.id === m.id)?.quantity ??
                      wallets.flatMap((w) => w.assets).find((a) => a.id === m.id)?.quantity ??
                      manuals.find((c) => c.id === m.id)?.quantity;
                    if (qty == null) return m;
                    return { ...m, day: { delta: q.change * qty, pct: q.changePct } };
                  })}
              />
            }
          />
      ) : null}
      <WalletGrid
        names={names}
        wallets={[
          ...brokerage.map((g) => ({
            id: g.id,
            address: "",
            addressType: "brokerage",
            label: g.institution,
            ownerLabel: g.ownerLabel,
            lastSyncedAt: null,
            lastError: null,
            brokerage: true,
            assets: g.assets.map((a) => ({
              id: a.id,
              chain: g.institution,
              symbol: a.symbol,
              name: a.name,
              quantity: a.quantity,
              quotePrice: a.quotePrice,
              logo: logoFor(a.symbol),
            })),
          })),
          ...wallets.map((w) => {
          const keep = new Set(
            collapseDuplicateSpot(
              w.assets.map((a) => ({
                chain: a.chain,
                tokenKey: a.tokenKey,
                symbol: a.symbol,
                name: a.name,
                contractAddress: a.contractAddress,
                decimals: a.decimals,
                quantity: a.quantity,
                coingeckoId: a.coingeckoId,
                quotePrice: a.quotePrice,
              })),
            ).map((a) => `${a.chain}:${a.tokenKey}`),
          );
          return {
            id: w.id,
            address: w.address,
            addressType: w.addressType,
            label: w.label,
            ownerLabel: ownerLabel(w.owner, names),
            lastSyncedAt: w.lastSyncedAt,
            lastError: w.lastError,
            assets: w.assets
              .filter((a) => keep.has(`${a.chain}:${a.tokenKey}`))
              .map((a) => ({
                id: a.id,
                chain: a.chain,
                tokenKey: a.tokenKey,
                symbol: a.symbol,
                name: a.name,
                quantity: a.quantity,
                quotePrice: a.quotePrice,
                logo: logoFor(a.symbol, a.coingeckoId),
              })),
          };
        }),
        ]}
        manuals={manuals.map((c) => ({
          id: c.id,
          symbol: c.symbol,
          name: c.name,
          quantity: c.quantity,
          quotePrice: c.quotePrice,
          notes: c.notes,
        }))}
      />
      {rows.length > 0 ? <InvestmentsBoard rows={rows} hideHero hideDonuts hideCostTotal minValue={10} /> : null}
    </>
  );
}


