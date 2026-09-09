/** Common tickers → CoinGecko ids. Unknown symbols are resolved via search. */
export const COINGECKO_IDS: Record<string, { id: string; name: string }> = {
  BTC: { id: "bitcoin", name: "Bitcoin" },
  ETH: { id: "ethereum", name: "Ethereum" },
  SOL: { id: "solana", name: "Solana" },
  XRP: { id: "ripple", name: "XRP" },
  ADA: { id: "cardano", name: "Cardano" },
  DOGE: { id: "dogecoin", name: "Dogecoin" },
  DOT: { id: "polkadot", name: "Polkadot" },
  AVAX: { id: "avalanche-2", name: "Avalanche" },
  LINK: { id: "chainlink", name: "Chainlink" },
  UNI: { id: "uniswap", name: "Uniswap" },
  ATOM: { id: "cosmos", name: "Cosmos" },
  OSMO: { id: "osmosis", name: "Osmosis" },
  TIA: { id: "celestia", name: "Celestia" },
  INJ: { id: "injective-protocol", name: "Injective" },
  SEI: { id: "sei-network", name: "Sei" },
  AKT: { id: "akash-network", name: "Akash" },
  KUJI: { id: "kujira", name: "Kujira" },
  JUNO: { id: "juno-network", name: "Juno" },
  STARS: { id: "stargaze", name: "Stargaze" },
  NTRN: { id: "neutron-3", name: "Neutron" },
  STRD: { id: "stride", name: "Stride" },
  LTC: { id: "litecoin", name: "Litecoin" },
  BCH: { id: "bitcoin-cash", name: "Bitcoin Cash" },
  XLM: { id: "stellar", name: "Stellar" },
  NEAR: { id: "near", name: "NEAR" },
  APT: { id: "aptos", name: "Aptos" },
  ARB: { id: "arbitrum", name: "Arbitrum" },
  OP: { id: "optimism", name: "Optimism" },
  SUI: { id: "sui", name: "Sui" },
  SSUI: { id: "spring-staked-sui", name: "Spring Staked SUI" },
  TON: { id: "the-open-network", name: "Toncoin" },
  SHIB: { id: "shiba-inu", name: "Shiba Inu" },
  PEPE: { id: "pepe", name: "Pepe" },
  HBAR: { id: "hedera-hashgraph", name: "Hedera" },
  TRX: { id: "tron", name: "TRON" },
  MATIC: { id: "matic-network", name: "Polygon" },
  POL: { id: "polygon-ecosystem-token", name: "POL" },
  USDC: { id: "usd-coin", name: "USD Coin" },
  USDT: { id: "tether", name: "Tether" },
  DAI: { id: "dai", name: "Dai" },
  USDG: { id: "global-dollar", name: "Global Dollar" },
  PYUSD: { id: "paypal-usd", name: "PayPal USD" },
  WETH: { id: "weth", name: "WETH" },
  WBTC: { id: "wrapped-bitcoin", name: "Wrapped Bitcoin" },
};

export type CryptoRef = { symbol: string; id: string; name: string };

export async function resolveCrypto(symbolOrId: string): Promise<CryptoRef | null> {
  const raw = symbolOrId.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (COINGECKO_IDS[upper]) return { symbol: upper, ...COINGECKO_IDS[upper] };

  const byId = Object.entries(COINGECKO_IDS).find(([, v]) => v.id === raw.toLowerCase());
  if (byId) return { symbol: byId[0], ...byId[1] };

  const res = await fetch(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(raw)}`,
    { cache: "no-store", headers: { accept: "application/json" } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    coins?: { id: string; name: string; symbol: string }[];
  };
  const coins = data.coins ?? [];
  const exact = coins.find((c) => c.symbol.toUpperCase() === upper);
  const pick = exact ?? coins[0];
  if (!pick) return null;
  return { symbol: pick.symbol.toUpperCase(), id: pick.id, name: pick.name };
}
