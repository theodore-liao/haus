import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Money } from "@/components/money";
import { prisma } from "@/lib/db";
import { getBrokerageCrypto, getNames } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { matchesOwner, ownerLabel } from "@/lib/owners";
import { CHAIN_META, collapseDuplicateSpot, isDefiAsset, shortAddress } from "@/lib/onchain";
import { lotValue } from "@/lib/crypto-lots";
import { InvestmentsBoard, type HoldingRow } from "@/components/holdings-table";
import { AddWallet, SyncAllWallets } from "./form";
import { WalletGrid } from "./wallet-grid";
import { enrichCryptoQuotes } from "@/lib/quotes";

export const dynamic = "force-dynamic";

export default async function CryptoPage() {
  const owner = await getOwnerFilter();
  const names = await getNames();
  await enrichCryptoQuotes().catch(() => null);

  const wallets = (await prisma.cryptoWallet.findMany({ include: { assets: true }, orderBy: { createdAt: "asc" } })).filter(
    (w) => matchesOwner(w.owner, owner),
  );
  const manuals = (await prisma.manualHolding.findMany({ where: { kind: "crypto" } })).filter((c) =>
    matchesOwner(c.owner, owner),
  );
  const brokerage = await getBrokerageCrypto(owner);

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
    });
  }

  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <>
      <PageHeader
        title="Cryptocurrencies"
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
        <div className="mb-4">
          <div className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">Wallet value</div>
          <div className="text-3xl font-medium font-mono tabular-nums">
            <Money value={total} />
          </div>
        </div>
      )}
      {rows.length > 0 ? (
        <div className="mb-4">
          <InvestmentsBoard rows={rows} hideHero hideTable minValue={10} classMode="asset" />
        </div>
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


