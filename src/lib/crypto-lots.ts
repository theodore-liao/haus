import { prisma } from "./db";
import { collapseDuplicateSpot } from "./onchain";

export type CryptoLot = {
  id: string;
  owner: string;
  symbol: string;
  name: string;
  quantity: number;
  quotePrice: number | null;
  quoteChange: number | null;
  quoteChangePct: number | null;
  coingeckoId: string | null;
  costBasis: number | null;
};

export function lotValue(c: { quotePrice: number | null; quantity: number }) {
  return (c.quotePrice ?? 0) * c.quantity;
}

export async function loadCryptoLots(): Promise<CryptoLot[]> {
  const [manual, wallets] = await Promise.all([
    prisma.manualHolding.findMany({ where: { kind: "crypto" } }),
    prisma.cryptoWallet.findMany({ include: { assets: true } }),
  ]);
  const lots: CryptoLot[] = manual.map((c) => ({
    id: c.id,
    owner: c.owner,
    symbol: c.symbol,
    name: c.name,
    quantity: c.quantity,
    quotePrice: c.quotePrice,
    quoteChange: c.quoteChange,
    quoteChangePct: c.quoteChangePct,
    coingeckoId: c.coingeckoId,
    costBasis: c.costBasis,
  }));
  for (const w of wallets) {
    const kept = new Set(
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
    for (const a of w.assets) {
      if (!kept.has(`${a.chain}:${a.tokenKey}`)) continue;
      lots.push({
        id: a.id,
        owner: w.owner,
        symbol: a.symbol,
        name: a.name,
        quantity: a.quantity,
        quotePrice: a.quotePrice,
        quoteChange: a.quoteChange,
        quoteChangePct: a.quoteChangePct,
        coingeckoId: a.coingeckoId,
        costBasis: null,
      });
    }
  }
  return lots;
}
