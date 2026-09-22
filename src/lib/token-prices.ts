/** Live USD prices for discovered tokens. No allowlist — price whatever the scanner found. */

export const MIN_TOKEN_USD = 10;

export type PricedToken = { price: number; symbol?: string; name?: string; changePct?: number };

/** CoinGecko renamed usd_24hr_change to usd_24h_change. Read whichever the response includes. */
export function geckoChangePct(row: { usd_24hr_change?: number | null; usd_24h_change?: number | null } | null | undefined) {
  const n = row?.usd_24h_change ?? row?.usd_24hr_change;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

const GECKO_PLATFORM: Record<string, string> = {
  ethereum: "ethereum",
  base: "base",
  polygon: "polygon-pos",
  arbitrum: "arbitrum-one",
  optimism: "optimistic-ethereum",
  gnosis: "xdai",
  scroll: "scroll",
  solana: "solana",
  tron: "tron",
  sui: "sui",
  avalanche: "avalanche",
  bsc: "binance-smart-chain",
  blast: "blast",
  linea: "linea",
  mantle: "mantle",
  zksync: "zksync",
  opbnb: "opbnb",
};

const DEX_CHAIN: Record<string, string> = {
  ethereum: "ethereum",
  base: "base",
  polygon: "polygon",
  arbitrum: "arbitrum",
  optimism: "optimism",
  gnosis: "gnosis",
  scroll: "scroll",
  solana: "solana",
  sui: "sui",
  tron: "tron",
  avalanche: "avalanche",
  bsc: "bsc",
  blast: "blast",
  linea: "linea",
  mantle: "mantle",
  zksync: "zksync",
  opbnb: "opbnb",
  hood: "robinhood",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normAddr(chain: string, addr: string) {
  if (chain === "solana") return addr;
  return addr.toLowerCase();
}

async function getJson(url: string, timeout = 12000): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json", "user-agent": "Haus/1.0" },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchSpotUsd(symbol: string, geckoId?: string | null): Promise<PricedToken | null> {
  const id = geckoId || null;
  if (id) {
    const g = await fetchGeckoIdPrices([id]);
    const hit = g.get(id);
    if (hit) return hit;
  }
  const sym = symbol.trim().toUpperCase();
  const cb = (await getJson(`https://api.coinbase.com/v2/prices/${encodeURIComponent(sym)}-USD/spot`)) as
    | { data?: { amount?: string } }
    | null;
  const cbAmt = Number(cb?.data?.amount);
  if (cbAmt > 0) return { price: cbAmt };
  if (id) {
    const cap = (await getJson(`https://api.coincap.io/v2/assets/${encodeURIComponent(id)}`)) as
      | { data?: { priceUsd?: string } }
      | null;
    const p = Number(cap?.data?.priceUsd);
    if (p > 0) return { price: p };
  }
  return null;
}

export async function fetchGeckoIdPrices(ids: string[]): Promise<Map<string, PricedToken>> {
  const out = new Map<string, PricedToken>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(chunk.join(","))}&vs_currencies=usd&include_24hr_change=true`;
    const data = (await getJson(url)) as Record<string, { usd?: number; usd_24hr_change?: number }> | null;
    for (const [id, row] of Object.entries(data ?? {})) {
      if (!row.usd || row.usd <= 0) continue;
      out.set(id, { price: row.usd, changePct: geckoChangePct(row) });
    }
    if (i + 40 < unique.length) await sleep(200);
  }
  return out;
}

export async function fetchGeckoContractPrices(platform: string, contracts: string[]): Promise<Map<string, PricedToken>> {
  const out = new Map<string, PricedToken>();
  const unique = [...new Set(contracts.map((c) => c.toLowerCase()))];
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const url = `https://api.coingecko.com/api/v3/simple/token_price/${encodeURIComponent(platform)}?contract_addresses=${encodeURIComponent(chunk.join(","))}&vs_currencies=usd&include_24hr_change=true`;
    const data = (await getJson(url)) as Record<string, { usd?: number; usd_24hr_change?: number }> | null;
    for (const [addr, row] of Object.entries(data ?? {})) {
      if (!row.usd || row.usd <= 0) continue;
      out.set(addr.toLowerCase(), { price: row.usd, changePct: geckoChangePct(row) });
    }
    if (i + 30 < unique.length) await sleep(200);
  }
  return out;
}

export async function fetchJupiterPrices(mints: string[]): Promise<Map<string, PricedToken>> {
  const out = new Map<string, PricedToken>();
  const unique = [...new Set(mints.filter(Boolean))];
  const urls = ["https://lite-api.jup.ag/price/v3", "https://api.jup.ag/price/v3"];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const qs = `ids=${encodeURIComponent(chunk.join(","))}`;
    let data: Record<string, { usdPrice?: number; priceChange24h?: number }> | null = null;
    for (const base of urls) {
      const json = (await getJson(`${base}?${qs}`)) as Record<string, { usdPrice?: number; priceChange24h?: number }> | null;
      if (json && Object.keys(json).length) {
        data = json;
        break;
      }
    }
    for (const [mint, row] of Object.entries(data ?? {})) {
      const price = row?.usdPrice;
      if (!price || price <= 0) continue;
      out.set(mint, { price, changePct: row.priceChange24h });
    }
    if (i + 50 < unique.length) await sleep(120);
  }
  return out;
}

export async function fetchDexScreenerPrices(chain: string, addresses: string[]): Promise<Map<string, PricedToken>> {
  const out = new Map<string, PricedToken>();
  const dexChain = DEX_CHAIN[chain] ?? chain;
  const unique = [...new Set(addresses.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const joined = chunk.map(encodeURIComponent).join(",");
    const data = (await getJson(`https://api.dexscreener.com/tokens/v1/${encodeURIComponent(dexChain)}/${joined}`, 15000)) as
      | {
          chainId?: string;
          priceUsd?: string;
          priceChange?: { h24?: number };
          liquidity?: { usd?: number };
          baseToken?: { address?: string; symbol?: string; name?: string };
          quoteToken?: { address?: string; symbol?: string; name?: string };
        }[]
      | null;
    if (!Array.isArray(data)) continue;
    const best = new Map<string, { liq: number; token: PricedToken }>();
    for (const pair of data) {
      const price = Number(pair.priceUsd);
      if (!price || price <= 0) continue;
      const liq = pair.liquidity?.usd ?? 0;
      const base = pair.baseToken?.address;
      if (!base) continue;
      const key = chain === "solana" ? base : base.toLowerCase();
      const prev = best.get(key);
      if (prev && prev.liq >= liq) continue;
      best.set(key, {
        liq,
        token: {
          price,
          symbol: pair.baseToken?.symbol,
          name: pair.baseToken?.name,
          changePct: pair.priceChange?.h24,
        },
      });
    }
    for (const [k, v] of best) out.set(k, v.token);
    if (i + 30 < unique.length) await sleep(80);
  }
  return out;
}

export async function fetchJupiterMeta(mints: string[]): Promise<Map<string, { symbol: string; name: string }>> {
  const out = new Map<string, { symbol: string; name: string }>();
  for (const mint of mints) {
    if (out.has(mint)) continue;
    const data = (await getJson(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`, 8000)) as
      | { id?: string; address?: string; symbol?: string; name?: string }[]
      | { tokens?: { id?: string; address?: string; symbol?: string; name?: string }[] }
      | null;
    const list = Array.isArray(data) ? data : data && "tokens" in data ? data.tokens ?? [] : [];
    const hit = list.find((t) => (t.id || t.address) === mint) ?? list[0];
    if (hit?.symbol) out.set(mint, { symbol: hit.symbol, name: hit.name ?? hit.symbol });
  }
  return out;
}

type AssetLike = {
  chain: string;
  symbol: string;
  name: string;
  quantity: number;
  contractAddress: string | null;
  coingeckoId: string | null;
  quotePrice?: number | null;
};

export async function attachPrices<T extends AssetLike>(assets: T[]): Promise<T[]> {
  const need = assets.filter((a) => !(a.quotePrice && a.quotePrice > 0));
  if (!need.length) return assets;

  const geckoIds = [...new Set(need.map((a) => a.coingeckoId).filter((id): id is string => Boolean(id)))];
  const byId = geckoIds.length ? await fetchGeckoIdPrices(geckoIds) : new Map<string, PricedToken>();

  const byPlatform = new Map<string, string[]>();
  for (const a of need) {
    if (a.coingeckoId && byId.has(a.coingeckoId)) continue;
    const platform = GECKO_PLATFORM[a.chain];
    if (!platform || !a.contractAddress) continue;
    const list = byPlatform.get(platform) ?? [];
    list.push(a.contractAddress);
    byPlatform.set(platform, list);
  }
  const byContract = new Map<string, PricedToken>();
  for (const [platform, contracts] of byPlatform) {
    const map = await fetchGeckoContractPrices(platform, contracts);
    for (const [addr, q] of map) byContract.set(`${platform}:${addr}`, q);
  }

  const solMints = [
    ...new Set(need.filter((a) => a.chain === "solana" && a.contractAddress).map((a) => a.contractAddress!)),
  ];
  const jup = solMints.length ? await fetchJupiterPrices(solMints) : new Map<string, PricedToken>();

  const dexNeed = new Map<string, string[]>();
  for (const a of need) {
    if (!a.contractAddress) continue;
    if (a.coingeckoId && byId.has(a.coingeckoId)) continue;
    const platform = GECKO_PLATFORM[a.chain];
    if (platform && byContract.has(`${platform}:${a.contractAddress.toLowerCase()}`)) continue;
    if (a.chain === "solana" && jup.has(a.contractAddress)) continue;
    const list = dexNeed.get(a.chain) ?? [];
    list.push(a.contractAddress);
    dexNeed.set(a.chain, list);
  }
  const dex = new Map<string, PricedToken>();
  for (const [chain, addrs] of dexNeed) {
    const map = await fetchDexScreenerPrices(chain, addrs);
    for (const [addr, q] of map) dex.set(`${chain}:${normAddr(chain, addr)}`, q);
  }

  const withPrice = assets.map((a) => {
    if (a.quotePrice && a.quotePrice > 0) return a;
    let hit: PricedToken | undefined;
    if (a.coingeckoId) hit = byId.get(a.coingeckoId);
    if (!hit && a.contractAddress) {
      const platform = GECKO_PLATFORM[a.chain];
      if (platform) hit = byContract.get(`${platform}:${a.contractAddress.toLowerCase()}`);
      if (!hit && a.chain === "solana") hit = jup.get(a.contractAddress);
      if (!hit) hit = dex.get(`${a.chain}:${normAddr(a.chain, a.contractAddress)}`);
    }
    if (!hit) return a;
    const symbol = (hit.symbol || a.symbol).slice(0, 16);
    const name = (hit.name || a.name).slice(0, 80);
    return { ...a, quotePrice: hit.price, symbol, name };
  });

  const leftover = [...new Set(withPrice.filter((a) => !(a.quotePrice && a.quotePrice > 0) && a.coingeckoId).map((a) => a.coingeckoId!))];
  if (leftover.length) {
    const extra = new Map<string, PricedToken>();
    for (const id of leftover.slice(0, 8)) {
      const sample = withPrice.find((a) => a.coingeckoId === id);
      const spot = await fetchSpotUsd(sample?.symbol ?? id, id);
      if (spot?.price) extra.set(id, spot);
    }
    if (extra.size) {
      for (let i = 0; i < withPrice.length; i++) {
        const a = withPrice[i];
        if (a.quotePrice && a.quotePrice > 0) continue;
        const hit = a.coingeckoId ? extra.get(a.coingeckoId) : undefined;
        if (hit) withPrice[i] = { ...a, quotePrice: hit.price };
      }
    }
  }

  const needMeta = withPrice
    .filter(
      (a) =>
        a.chain === "solana" &&
        a.contractAddress &&
        (a.quotePrice ?? 0) * a.quantity >= MIN_TOKEN_USD &&
        a.symbol === a.contractAddress.slice(0, 6).toUpperCase(),
    )
    .map((a) => a.contractAddress!)
    .slice(0, 40);
  const meta = needMeta.length ? await fetchJupiterMeta(needMeta) : new Map();
  if (!meta.size) return withPrice;
  return withPrice.map((a) => {
    const m = a.contractAddress ? meta.get(a.contractAddress) : undefined;
    if (!m) return a;
    return { ...a, symbol: m.symbol.slice(0, 16), name: m.name.slice(0, 80) };
  });
}

export function significantOnly<T extends { quantity: number; quotePrice?: number | null; tokenKey?: string | null; chain?: string }>(
  assets: T[],
): T[] {
  return assets.filter((a) => {
    if ((a.quotePrice ?? 0) * a.quantity >= MIN_TOKEN_USD) return true;
    // Don't wipe native BTC/ETH because a quote miss made USD look like $0.
    return (a.quotePrice == null || a.quotePrice <= 0) && a.quantity > 0 && (a.tokenKey === "native" || a.chain === "bitcoin");
  });
}
