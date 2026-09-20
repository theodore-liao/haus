import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Money } from "@/components/money";
import { HeroCard } from "@/components/hero-card";
import { prisma } from "@/lib/db";
import { getBrokerageCrypto, getNames } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { matchesOwner, ownerLabel } from "@/lib/owners";
import { CHAIN_META, collapseDuplicateSpot, isDefiAsset, shortAddress } from "@/lib/onchain";
import { lotValue } from "@/lib/crypto-lots";
import { InvestmentsBoard, type HoldingRow } from "@/components/holdings-table";
import { AddWallet, SyncAllWallets } from "./form";
import { WalletGrid } from "./wallet-grid";
import { enrichCryptoQuotesInBackground } from "@/lib/quotes";
import { getCryptoLogoMap } from "@/lib/crypto-logos";
import { COINGECKO_IDS } from "@/lib/crypto-assets";

export const dynamic = "force-dynamic";

export default async function CryptoPage() {
  const owner = await getOwnerFilter();
  enrichCryptoQuotesInBackground();

  const [names, allWallets, allManuals, brokerage] = await Promise.all([
    getNames(),
    prisma.cryptoWallet.findMany({ include: { assets: true }, orderBy: { createdAt: "asc" } }),
    prisma.manualHolding.findMany({ where: { kind: "crypto" } }),
    getBrokerageCrypto(owner),
  ]);
  const wallets = allWallets.filter((w) => matchesOwner(w.owner, owner));
  const manuals = allManuals.filter((c) => matchesOwner(c.owner, owner));

  const geckoId = (symbol: string, id?: string | null) => id ?? COINGECKO_IDS[symbol.toUpperCase()]?.id ?? null;
  const logos = await getCryptoLogoMap([
    ...wallets.flatMap((w) => w.assets.map((a) => geckoId(a.symbol, a.coingeckoId))),
    ...manuals.map((c) => geckoId(c.symbol, c.coingeckoId)),
    ...brokerage.flatMap((g) => g.assets.map((a) => geckoId(a.symbol))),
  ]);
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
        dayPl: a.quoteChange != null ? a.quoteChange * a.quantity : null,
        totalPl: null,
        dayPct: a.quoteChangePct,
        weight: 0,
        manual: false,
        brandKind: "crypto",
        brandSrc: logoFor(a.symbol, a.coingeckoId),
      });
    }
  }
  for (const g of brokerage) {
    for (const a of g.assets) {
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
        dayPl: null,
        totalPl: null,
        dayPct: null,
        weight: 0,
        manual: false,
        brandKind: "crypto",
        brandSrc: logoFor(a.symbol),
      });
    }
  }
  for (const c of manuals) {
    const value = lotValue(c);
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
      dayPl: c.quoteChange != null ? c.quoteChange * c.quantity : null,
      totalPl: c.costBasis != null ? value - c.costBasis : null,
      dayPct: c.quoteChangePct,
      weight: 0,
      manual: true,
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
          <InvestmentsBoard rows={rows} hideHero hideTable minValue={10} classMode="asset" />
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
      {rows.length > 0 ? <InvestmentsBoard rows={rows} hideHero hideDonuts minValue={10} /> : null}
    </>
  );
}


