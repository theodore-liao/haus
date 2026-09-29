import { createHash } from "crypto";
import { bech32 } from "@scure/base";
import { COINGECKO_IDS } from "./crypto-assets";
import { hdAddresses, slip132Variants } from "./btc-hd";
import { attachPrices, significantOnly } from "./token-prices";

export type OnchainAsset = {
  chain: string;
  tokenKey: string;
  symbol: string;
  name: string;
  contractAddress: string | null;
  decimals: number;
  quantity: number;
  coingeckoId: string | null;
  quotePrice?: number | null;
};

/** confirmedChains are lookups that finished. keepTokens are exact keys, or prefixes ending in ":". */
type ScanPart = {
  assets: OnchainAsset[];
  confirmedChains: string[];
  keepTokens: string[];
};

function scanPart(assets: OnchainAsset[], confirmedChains: string[], keepTokens: string[] = []): ScanPart {
  return { assets, confirmedChains, keepTokens };
}

export type AddressType = "evm" | "bitcoin" | "xpub" | "solana" | "tron" | "sui" | "cosmos" | "litecoin" | "dogecoin";

type CosmosNet = {
  chain: string;
  label: string;
  nativeDenom: string;
  symbol: string;
  name: string;
  decimals: number;
  gecko: string;
  mintscan: string;
  lcds: string[];
};

/** BIP-44 coin types that do not share the Cosmos Hub key (118). */
const COSMOS_COIN_TYPE: Record<string, number> = {
  inj: 60,
  secret: 529,
  kava: 459,
  terra: 330,
  dym: 60,
};

function cosmosCoinType(hrp: string) {
  return COSMOS_COIN_TYPE[hrp] ?? 118;
}

const COSMOS_HRP: Record<string, CosmosNet> = {
  cosmos: {
    chain: "cosmos",
    label: "Cosmos Hub",
    nativeDenom: "uatom",
    symbol: "ATOM",
    name: "Cosmos Hub",
    decimals: 6,
    gecko: "cosmos",
    mintscan: "cosmos",
    lcds: [
      "https://cosmos-rest.publicnode.com",
      "https://rest.cosmos.directory/cosmoshub",
      "https://lcd-cosmoshub.keplr.app",
    ],
  },
  osmo: {
    chain: "osmosis",
    label: "Osmosis",
    nativeDenom: "uosmo",
    symbol: "OSMO",
    name: "Osmosis",
    decimals: 6,
    gecko: "osmosis",
    mintscan: "osmosis",
    lcds: ["https://lcd.osmosis.zone", "https://rest.cosmos.directory/osmosis"],
  },
  celestia: {
    chain: "celestia",
    label: "Celestia",
    nativeDenom: "utia",
    symbol: "TIA",
    name: "Celestia",
    decimals: 6,
    gecko: "celestia",
    mintscan: "celestia",
    lcds: ["https://celestia-rest.publicnode.com", "https://rest.cosmos.directory/celestia"],
  },
  juno: {
    chain: "juno",
    label: "Juno",
    nativeDenom: "ujuno",
    symbol: "JUNO",
    name: "Juno",
    decimals: 6,
    gecko: "juno-network",
    mintscan: "juno",
    lcds: ["https://rest.cosmos.directory/juno"],
  },
  stars: {
    chain: "stargaze",
    label: "Stargaze",
    nativeDenom: "ustars",
    symbol: "STARS",
    name: "Stargaze",
    decimals: 6,
    gecko: "stargaze",
    mintscan: "stargaze",
    lcds: ["https://rest.cosmos.directory/stargaze"],
  },
  akash: {
    chain: "akash",
    label: "Akash",
    nativeDenom: "uakt",
    symbol: "AKT",
    name: "Akash",
    decimals: 6,
    gecko: "akash-network",
    mintscan: "akash",
    lcds: ["https://rest.cosmos.directory/akash"],
  },
  inj: {
    chain: "injective",
    label: "Injective",
    nativeDenom: "inj",
    symbol: "INJ",
    name: "Injective",
    decimals: 18,
    gecko: "injective-protocol",
    mintscan: "injective",
    lcds: [
      "https://sentry.lcd.injective.network",
      "https://lcd-injective.keplr.app",
      "https://rest.cosmos.directory/injective",
    ],
  },
  kujira: {
    chain: "kujira",
    label: "Kujira",
    nativeDenom: "ukuji",
    symbol: "KUJI",
    name: "Kujira",
    decimals: 6,
    gecko: "kujira",
    mintscan: "kujira",
    lcds: ["https://kujira-api.polkachu.com", "https://rest.cosmos.directory/kujira"],
  },
  sei: {
    chain: "sei",
    label: "Sei",
    nativeDenom: "usei",
    symbol: "SEI",
    name: "Sei",
    decimals: 6,
    gecko: "sei-network",
    mintscan: "sei",
    lcds: ["https://rest.cosmos.directory/sei"],
  },
  noble: {
    chain: "noble",
    label: "Noble",
    nativeDenom: "uusdc",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    gecko: "usd-coin",
    mintscan: "noble",
    lcds: ["https://rest.cosmos.directory/noble"],
  },
  neutron: {
    chain: "neutron",
    label: "Neutron",
    nativeDenom: "untrn",
    symbol: "NTRN",
    name: "Neutron",
    decimals: 6,
    gecko: "neutron-3",
    mintscan: "neutron",
    lcds: ["https://rest.cosmos.directory/neutron"],
  },
  dym: {
    chain: "dymension",
    label: "Dymension",
    nativeDenom: "adym",
    symbol: "DYM",
    name: "Dymension",
    decimals: 18,
    gecko: "dymension",
    mintscan: "dymension",
    lcds: ["https://rest.cosmos.directory/dymension"],
  },
  stride: {
    chain: "stride",
    label: "Stride",
    nativeDenom: "ustrd",
    symbol: "STRD",
    name: "Stride",
    decimals: 6,
    gecko: "stride",
    mintscan: "stride",
    lcds: ["https://rest.cosmos.directory/stride"],
  },
  secret: {
    chain: "secret",
    label: "Secret",
    nativeDenom: "uscrt",
    symbol: "SCRT",
    name: "Secret",
    decimals: 6,
    gecko: "secret",
    mintscan: "secret",
    lcds: ["https://rest.cosmos.directory/secretnetwork"],
  },
  kava: {
    chain: "kava",
    label: "Kava",
    nativeDenom: "ukava",
    symbol: "KAVA",
    name: "Kava",
    decimals: 6,
    gecko: "kava",
    mintscan: "kava",
    lcds: ["https://rest.cosmos.directory/kava"],
  },
  terra: {
    chain: "terra",
    label: "Terra",
    nativeDenom: "uluna",
    symbol: "LUNA",
    name: "Terra",
    decimals: 6,
    gecko: "terra-luna-2",
    mintscan: "terra",
    lcds: ["https://rest.cosmos.directory/terra"],
  },
  dydx: {
    chain: "dydx",
    label: "dYdX",
    nativeDenom: "adydx",
    symbol: "DYDX",
    name: "dYdX",
    decimals: 18,
    gecko: "dydx-chain",
    mintscan: "dydx",
    lcds: ["https://rest.cosmos.directory/dydx"],
  },
};

export const CHAIN_META: Record<
  string,
  { label: string; explorer: (addr: string) => string; nativeGecko: string }
> = {
  bitcoin: { label: "Bitcoin", explorer: (a) => `https://mempool.space/address/${a}`, nativeGecko: "bitcoin" },
  ethereum: { label: "Ethereum", explorer: (a) => `https://etherscan.io/address/${a}`, nativeGecko: "ethereum" },
  base: { label: "Base", explorer: (a) => `https://basescan.org/address/${a}`, nativeGecko: "ethereum" },
  polygon: { label: "Polygon", explorer: (a) => `https://polygonscan.com/address/${a}`, nativeGecko: "polygon-ecosystem-token" },
  arbitrum: { label: "Arbitrum", explorer: (a) => `https://arbiscan.io/address/${a}`, nativeGecko: "ethereum" },
  optimism: { label: "Optimism", explorer: (a) => `https://optimistic.etherscan.io/address/${a}`, nativeGecko: "ethereum" },
  gnosis: { label: "Gnosis", explorer: (a) => `https://gnosisscan.io/address/${a}`, nativeGecko: "xdai" },
  scroll: { label: "Scroll", explorer: (a) => `https://scrollscan.com/address/${a}`, nativeGecko: "ethereum" },
  solana: { label: "Solana", explorer: (a) => `https://solscan.io/account/${a}`, nativeGecko: "solana" },
  tron: { label: "TRON", explorer: (a) => `https://tronscan.org/#/address/${a}`, nativeGecko: "tron" },
  sui: { label: "Sui", explorer: (a) => `https://suiscan.xyz/mainnet/account/${a}`, nativeGecko: "sui" },
  cosmos: {
    label: "Cosmos",
    explorer: (a) => {
      const hrp = a.split("1")[0] ?? "cosmos";
      const slug = COSMOS_HRP[hrp]?.mintscan ?? "cosmos";
      return `https://www.mintscan.io/${slug}/address/${a}`;
    },
    nativeGecko: "cosmos",
  },
  osmosis: { label: "Osmosis", explorer: (a) => `https://www.mintscan.io/osmosis/address/${a}`, nativeGecko: "osmosis" },
  kujira: { label: "Kujira", explorer: (a) => `https://finder.kujira.network/kaiyo-1/address/${a}`, nativeGecko: "kujira" },
  injective: { label: "Injective", explorer: (a) => `https://www.mintscan.io/injective/address/${a}`, nativeGecko: "injective-protocol" },
  celestia: { label: "Celestia", explorer: (a) => `https://www.mintscan.io/celestia/address/${a}`, nativeGecko: "celestia" },
  litecoin: { label: "Litecoin", explorer: (a) => `https://litecoinspace.org/address/${a}`, nativeGecko: "litecoin" },
  dogecoin: { label: "Dogecoin", explorer: (a) => `https://blockchair.com/dogecoin/address/${a}`, nativeGecko: "dogecoin" },
  xpub: { label: "Bitcoin", explorer: (a) => `https://www.blockchain.com/explorer/assets/btc/xpub/${a}`, nativeGecko: "bitcoin" },
  defi: { label: "DeFi", explorer: (a) => `https://debank.com/profile/${a}`, nativeGecko: "ethereum" },
  bsc: { label: "BNB Chain", explorer: (a) => `https://bscscan.com/address/${a}`, nativeGecko: "binancecoin" },
  avalanche: { label: "Avalanche", explorer: (a) => `https://snowtrace.io/address/${a}`, nativeGecko: "avalanche-2" },
  hood: { label: "Robinhood Chain", explorer: (a) => `https://robinhoodchain.blockscout.com/address/${a}`, nativeGecko: "ethereum" },
  opbnb: { label: "opBNB", explorer: (a) => `https://opbnbscan.com/address/${a}`, nativeGecko: "binancecoin" },
  blast: { label: "Blast", explorer: (a) => `https://blastscan.io/address/${a}`, nativeGecko: "ethereum" },
  linea: { label: "Linea", explorer: (a) => `https://lineascan.build/address/${a}`, nativeGecko: "ethereum" },
  mantle: { label: "Mantle", explorer: (a) => `https://explorer.mantle.xyz/address/${a}`, nativeGecko: "mantle" },
  zksync: { label: "zkSync", explorer: (a) => `https://explorer.zksync.io/address/${a}`, nativeGecko: "ethereum" },
};

const EVM_EXPLORERS = [
  { chain: "ethereum", host: "https://eth.blockscout.com", symbol: "ETH", name: "Ether", gecko: "ethereum", platform: "ethereum" },
  { chain: "base", host: "https://base.blockscout.com", symbol: "ETH", name: "Ether", gecko: "ethereum", platform: "base" },
  { chain: "polygon", host: "https://polygon.blockscout.com", symbol: "POL", name: "Polygon", gecko: "polygon-ecosystem-token", platform: "polygon-pos" },
  { chain: "arbitrum", host: "https://arbitrum.blockscout.com", symbol: "ETH", name: "Ether", gecko: "ethereum", platform: "arbitrum-one" },
  { chain: "optimism", host: "https://optimism.blockscout.com", symbol: "ETH", name: "Ether", gecko: "ethereum", platform: "optimistic-ethereum" },
  { chain: "gnosis", host: "https://gnosis.blockscout.com", symbol: "xDAI", name: "xDAI", gecko: "xdai", platform: "xdai" },
  { chain: "scroll", host: "https://scroll.blockscout.com", symbol: "ETH", name: "Ether", gecko: "ethereum", platform: "scroll" },
  { chain: "hood", host: "https://robinhoodchain.blockscout.com", symbol: "ETH", name: "Ether", gecko: "ethereum", platform: "ethereum" },
] as const;

const SOL_TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SOL_TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export function classifyAddress(raw: string): { type: AddressType; address: string } | null {
  const addr = raw.trim();
  if (!addr) return null;
  if (/^(xpub|ypub|zpub|Ypub|Zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{50,}$/.test(addr)) {
    return { type: "xpub", address: addr };
  }
  if (addr.endsWith(".eth") && addr.length > 4) return { type: "evm", address: addr.toLowerCase() };
  if (/^0x[a-fA-F0-9]{40}$/.test(addr)) return { type: "evm", address: addr.toLowerCase() };
  if (/^0x[a-fA-F0-9]{1,64}$/.test(addr) && addr.length !== 42) {
    const hex = addr.slice(2).toLowerCase().padStart(64, "0");
    return { type: "sui", address: `0x${hex}` };
  }
  if (/^(bc1|tb1)[a-zA-HJ-NP-Z0-9]{25,87}$/i.test(addr)) return { type: "bitcoin", address: addr };
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr)) return { type: "bitcoin", address: addr };
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return { type: "tron", address: addr };
  if (/^ltc1[a-z0-9]{20,87}$/i.test(addr)) return { type: "litecoin", address: addr.toLowerCase() };
  // Legacy Litecoin and Dogecoin addresses look like Solana keys; the checksum and version byte tell them apart.
  const legacy = legacyCoinType(addr);
  if (legacy) return { type: legacy, address: addr };
  const bech = addr.toLowerCase().match(/^([a-z]{2,16})1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{20,}$/);
  if (bech && COSMOS_HRP[bech[1]]) return { type: "cosmos", address: addr.toLowerCase() };
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return { type: "solana", address: addr };
  return null;
}

/** Version bytes of base58check Litecoin (L, M) and Dogecoin (D, 9, A) addresses. */
const LEGACY_VERSIONS: Record<number, "litecoin" | "dogecoin"> = { 0x30: "litecoin", 0x32: "litecoin", 0x1e: "dogecoin", 0x16: "dogecoin" };

export function legacyCoinType(addr: string): "litecoin" | "dogecoin" | null {
  if (!/^[LMD9A][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr)) return null;
  try {
    const bytes = b58decode(addr);
    if (bytes.length !== 25) return null;
    const check = createHash("sha256").update(createHash("sha256").update(bytes.subarray(0, 21)).digest()).digest();
    for (let i = 0; i < 4; i++) if (check[i] !== bytes[21 + i]) return null;
    return LEGACY_VERSIONS[bytes[0]] ?? null;
  } catch {
    return null;
  }
}

function geckoForSymbol(symbol: string) {
  return COINGECKO_IDS[symbol.toUpperCase()]?.id ?? null;
}

function fromBaseUnits(raw: string, decimals: number): number {
  try {
    const n = BigInt(raw.split(".")[0] || "0");
    const d = Math.max(0, Math.min(36, decimals));
    const base = BigInt(10) ** BigInt(d);
    const whole = n / base;
    const frac = n % base;
    return Number(whole) + Number(frac) / Number(base);
  } catch {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return n / 10 ** decimals;
  }
}

async function getJson(url: string, timeout = 8000): Promise<unknown | null> {
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

async function postJson(url: string, body: unknown, timeout = 8000): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function resolveEns(name: string): Promise<string | null> {
  const data = (await getJson(`https://api.ensideas.com/ens/resolve/${encodeURIComponent(name)}`)) as
    | { address?: string }
    | null;
  const addr = data?.address;
  if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr.toLowerCase();
  return null;
}

type EsploraAddress = {
  chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
  mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
};

async function scanBitcoin(address: string): Promise<ScanPart> {
  const a = encodeURIComponent(address);
  // Two keyless Esplora hosts; the second answers when the first is down or rate limiting.
  const data =
    ((await getJson(`https://blockstream.info/api/address/${a}`)) as EsploraAddress | null) ??
    ((await getJson(`https://mempool.space/api/address/${a}`)) as EsploraAddress | null);
  const chain = data?.chain_stats;
  if (!chain) return scanPart([], []);
  const funded = (chain.funded_txo_sum ?? 0) + (data?.mempool_stats?.funded_txo_sum ?? 0);
  const spent = (chain.spent_txo_sum ?? 0) + (data?.mempool_stats?.spent_txo_sum ?? 0);
  const qty = (funded - spent) / 1e8;
  if (qty <= 0) return scanPart([], ["bitcoin"]);
  return scanPart(
    [
      {
        chain: "bitcoin",
        tokenKey: "native",
        symbol: "BTC",
        name: "Bitcoin",
        contractAddress: null,
        decimals: 8,
        quantity: qty,
        coingeckoId: "bitcoin",
      },
    ],
    ["bitcoin"],
  );
}

/** Litecoin and Dogecoin balances from BlockCypher's keyless API (unconfirmed included). */
async function scanBlockcypher(chain: "litecoin" | "dogecoin", address: string): Promise<ScanPart> {
  const path = chain === "litecoin" ? "ltc" : "doge";
  const data = (await getJson(`https://api.blockcypher.com/v1/${path}/main/addrs/${encodeURIComponent(address)}/balance`)) as {
    final_balance?: number;
  } | null;
  if (typeof data?.final_balance !== "number") return scanPart([], []);
  const qty = data.final_balance / 1e8;
  if (qty <= 0) return scanPart([], [chain]);
  return scanPart(
    [
      {
        chain,
        tokenKey: "native",
        symbol: chain === "litecoin" ? "LTC" : "DOGE",
        name: chain === "litecoin" ? "Litecoin" : "Dogecoin",
        contractAddress: null,
        decimals: 8,
        quantity: qty,
        coingeckoId: chain,
      },
    ],
    [chain],
  );
}

async function scanEvmChain(
  address: string,
  explorer: (typeof EVM_EXPLORERS)[number],
): Promise<{ assets: OnchainAsset[]; failed: boolean }> {
  const out: OnchainAsset[] = [];
  const info = (await getJson(`${explorer.host}/api/v2/addresses/${address}`)) as {
    coin_balance?: string;
  } | null;
  const tokens = (await getJson(`${explorer.host}/api/v2/addresses/${address}/token-balances`)) as
    | {
        token?: {
          address?: string;
          symbol?: string | null;
          name?: string | null;
          decimals?: string | number | null;
          type?: string | null;
          exchange_rate?: string | null;
        };
        value?: string;
      }[]
    | null;
  // Either endpoint missing means this chain did not finish. An empty token list is a real zero.
  const failed = info == null || !Array.isArray(tokens);
  if (info?.coin_balance) {
    const qty = fromBaseUnits(info.coin_balance, 18);
    if (qty > 0) {
      out.push({
        chain: explorer.chain,
        tokenKey: "native",
        symbol: explorer.symbol,
        name: explorer.name,
        contractAddress: null,
        decimals: 18,
        quantity: qty,
        coingeckoId: explorer.gecko,
      });
    }
  }
  if (Array.isArray(tokens)) {
    for (const row of tokens) {
      const type = (row.token?.type ?? "").toUpperCase();
      if (type && type !== "ERC-20" && type !== "ERC20") continue;
      const symbol = (row.token?.symbol ?? "").trim();
      if (!symbol) continue;
      const decimals = Number(row.token?.decimals ?? 18);
      const qty = fromBaseUnits(row.value ?? "0", Number.isFinite(decimals) ? decimals : 18);
      if (qty <= 0) continue;
      const rate = row.token?.exchange_rate ? Number(row.token.exchange_rate) : 0;
      const contract = row.token?.address?.toLowerCase() ?? null;
      out.push({
        chain: explorer.chain,
        tokenKey: contract ?? symbol.toLowerCase(),
        symbol: symbol.toUpperCase().slice(0, 16),
        name: (row.token?.name ?? symbol).slice(0, 80),
        contractAddress: contract,
        decimals: Number.isFinite(decimals) ? decimals : 18,
        quantity: qty,
        coingeckoId: geckoForSymbol(symbol),
        quotePrice: rate > 0 ? rate : null,
      });
    }
  }
  return { assets: out, failed };
}

function mergeAssets(into: OnchainAsset[], extra: OnchainAsset[]) {
  const seen = new Set(into.map((a) => `${a.chain}:${a.tokenKey}`));
  for (const a of extra) {
    const k = `${a.chain}:${a.tokenKey}`;
    if (seen.has(k)) continue;
    seen.add(k);
    into.push(a);
  }
  return into;
}

/** Circle-issued USDC only. Explorers list dozens of “USDC Join-…” phishing tokens. */
const CANONICAL_USDC: Record<string, string[]> = {
  ethereum: ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
  eth: ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
  base: ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
  polygon: ["0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"],
  arbitrum: ["0xaf88d065e77c8cc2239327c5edb3a432268e5831"],
  optimism: ["0x0b2c639c533813f4aa9d7837caf62653d097ff85"],
  avalanche: ["0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e"],
  bsc: ["0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"],
  linea: ["0x176211869ca2b568f2a7d4ee941e073a821ee1ff"],
  zksync: ["0x1d17cbcf0d6d143135ae902365d2e5e2a16538d4"],
  solana: ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"],
  sui: ["0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"],
  noble: ["uusdc"],
};

/** Tether-issued USDT. No Sui native USDT — bridged “USDT” on Sui is dropped. */
const CANONICAL_USDT: Record<string, string[]> = {
  ethereum: ["0xdac17f958d2ee523a2206206994597c13d831ec7"],
  eth: ["0xdac17f958d2ee523a2206206994597c13d831ec7"],
  tron: ["TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"],
  solana: ["Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"],
  avalanche: ["0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7"],
  bsc: ["0x55d398326f99059ff775485246999027b3197955"],
  polygon: ["0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
  arbitrum: ["0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9"],
  optimism: ["0x01bff41798a0bcf287b996046ca68b395dbc1071", "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58"],
  base: ["0xfde4c96c8593536e31f229ea8f37b2ada2699bb2"],
};

function normTokenId(chain: string, id: string | null | undefined): string {
  if (!id) return "";
  if (chain === "sui" || id.includes("::")) return normalizeSuiType(id).toLowerCase();
  if (chain === "solana" || chain === "tron") return id;
  return id.toLowerCase();
}

function looksLikeStable(symbol: string, name: string): "usdc" | "usdt" | null {
  const blob = `${symbol} ${name}`.toUpperCase();
  const compact = blob.replace(/[^A-Z0-9]/g, "");
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/USDCOM|JOIN[\s-]*USD/i.test(blob)) return /USDT/.test(compact) ? "usdt" : "usdc";
  if (sym === "USDT" || sym === "TETHER" || compact === "TETHER" || compact === "USDT") return "usdt";
  if (sym === "USDC" || sym === "USDBC" || sym === "USDCOIN") return "usdc";
  if (/^USDT/.test(sym) && sym.length <= 24) return "usdt";
  if (/^USDC/.test(sym) && sym.length <= 24) return "usdc";
  if (/\bUSDT\b/.test(blob) || compact.includes("TETHER")) return "usdt";
  if (/\bUSDC\b/.test(blob) || compact.includes("USDCOIN")) return "usdc";
  return null;
}

function isCanonicalStable(kind: "usdc" | "usdt", chain: string, contract: string | null, tokenKey?: string): boolean {
  if (kind === "usdc" && chain === "noble" && (tokenKey === "native" || !contract)) return true;
  const list = (kind === "usdc" ? CANONICAL_USDC : CANONICAL_USDT)[chain];
  if (!list?.length) return false;
  const id = normTokenId(chain, contract);
  if (!id) return false;
  return list.some((c) => normTokenId(chain, c) === id);
}

export function dropFakeStables(assets: OnchainAsset[]): OnchainAsset[] {
  return assets.filter((a) => {
    if (a.tokenKey.startsWith("defi:")) return true;
    const blob = `${a.symbol} ${a.name}`;
    if (/join[\s-]/i.test(blob) || /usdcom/i.test(blob)) return false;
    const kind = looksLikeStable(a.symbol, a.name);
    if (!kind) return true;
    return isCanonicalStable(kind, a.chain, a.contractAddress, a.tokenKey);
  });
}

export function collapseDuplicateSpot(assets: OnchainAsset[]): OnchainAsset[] {
  const defi: OnchainAsset[] = [];
  const groups = new Map<string, OnchainAsset[]>();
  for (const a of assets) {
    if (a.tokenKey.startsWith("defi:")) {
      defi.push(a);
      continue;
    }
    const k = `${a.chain}:${a.symbol.toUpperCase()}`;
    const list = groups.get(k) ?? [];
    list.push(a);
    groups.set(k, list);
  }
  const out = [...defi];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    const qtyClose = (a: OnchainAsset, b: OnchainAsset) => {
      const base = Math.max(a.quantity, b.quantity, 1e-12);
      return Math.abs(a.quantity - b.quantity) / base < 0.05;
    };
    const used = new Set<number>();
    for (let i = 0; i < list.length; i++) {
      if (used.has(i)) continue;
      let best = list[i];
      for (let j = i + 1; j < list.length; j++) {
        if (used.has(j)) continue;
        const other = list[j];
        const sameContract =
          best.contractAddress &&
          other.contractAddress &&
          best.contractAddress.toLowerCase() === other.contractAddress.toLowerCase();
        const oneMissing = !best.contractAddress || !other.contractAddress;
        if ((sameContract || oneMissing) && qtyClose(best, other)) {
          const scored = (a: OnchainAsset) =>
            (a.contractAddress ? 2 : 0) + (a.quotePrice && a.quotePrice > 0 ? 1 : 0);
          if (scored(other) > scored(best)) best = other;
          used.add(j);
        }
      }
      used.add(i);
      out.push(best);
    }
  }
  return out;
}

async function scanRabbyTokens(address: string): Promise<{ assets: OnchainAsset[]; failed: boolean; confirmedChains: string[] }> {
  const used = (await getJson(`https://api.rabby.io/v1/user/used_chain_list?id=${encodeURIComponent(address)}`, 12000)) as
    | { id?: string; name?: string }[]
    | null;
  let failed = false;
  let chains = Array.isArray(used) ? used.filter((c) => c.id) : [];
  if (!Array.isArray(used)) {
    const total = (await getJson(`https://api.rabby.io/v1/user/total_balance?id=${encodeURIComponent(address)}`, 12000)) as
      | { chain_list?: { id?: string; name?: string; usd_value?: number }[] }
      | null;
    if (total == null) failed = true;
    chains = (total?.chain_list ?? []).filter((c) => c.id && (c.usd_value ?? 0) > 0);
  }
  // Rabby drops chains the address has not "used" recently. Robinhood Chain is easy to lose that way.
  if (!chains.some((c) => c.id === "hood")) chains = [...chains, { id: "hood", name: "Robinhood Chain" }];
  if (!chains.length) return { assets: [], failed, confirmedChains: [] };
  const confirmedChains: string[] = [];
  const batches = await Promise.allSettled(
    chains.map(async (c) => {
      const chainId = c.id!;
      const tokens = (await getJson(
        `https://api.rabby.io/v1/user/token_list?id=${encodeURIComponent(address)}&chain_id=${encodeURIComponent(chainId)}&is_all=false`,
        12000,
      )) as
        | {
            id?: string;
            chain?: string;
            symbol?: string;
            name?: string;
            decimals?: number;
            price?: number;
            amount?: number;
          }[]
        | null;
      if (!Array.isArray(tokens)) return [];
      const chain = DEBANK_CHAINS[chainId] ?? chainId;
      confirmedChains.push(chain);
      const out: OnchainAsset[] = [];
      for (const t of tokens) {
        const qty = Number(t.amount ?? 0);
        const price = Number(t.price ?? 0);
        if (!(qty > 0)) continue;
        const contract = t.id && t.id.startsWith("0x") ? t.id.toLowerCase() : null;
        const native = !contract;
        const symbol = (t.symbol ?? (native ? chainId : "TOKEN")).toUpperCase().slice(0, 16);
        out.push({
          chain,
          tokenKey: native ? "native" : contract!,
          symbol,
          name: (t.name ?? symbol).slice(0, 80),
          contractAddress: contract,
          decimals: t.decimals ?? 18,
          quantity: qty,
          coingeckoId: geckoForSymbol(symbol) ?? (native ? CHAIN_META[chain]?.nativeGecko ?? null : null),
          quotePrice: price > 0 ? price : null,
        });
      }
      return out;
    }),
  );
  return {
    assets: batches.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    failed,
    confirmedChains,
  };
}

async function scanEvm(address: string): Promise<ScanPart> {
  const rabby = await scanRabbyTokens(address).catch(() => ({
    assets: [] as OnchainAsset[],
    failed: true,
    confirmedChains: [] as string[],
  }));
  const batches = await Promise.all(
    EVM_EXPLORERS.map(async (ex) => {
      const r = await scanEvmChain(address, ex).catch(() => ({ assets: [] as OnchainAsset[], failed: true }));
      return { chain: ex.chain, ...r };
    }),
  );
  const confirmed = new Set<string>();
  const explorerFailed = new Set<string>();
  const explorerAssets: OnchainAsset[] = [];
  for (const r of batches) {
    if (r.failed) {
      explorerFailed.add(r.chain);
      continue;
    }
    confirmed.add(r.chain);
    explorerAssets.push(...r.assets);
  }
  if (!rabby.failed) {
    for (const chain of rabby.confirmedChains) {
      if (!explorerFailed.has(chain)) confirmed.add(chain);
    }
  }
  return scanPart(mergeAssets(rabby.assets, explorerAssets), [...confirmed]);
}

async function solStakedLamports(address: string): Promise<number | null> {
  let total = 0;
  let answered = false;
  const seen = new Set<string>();
  for (const offset of [12, 44]) {
    const result = (await solRpc("getProgramAccounts", [
      "Stake11111111111111111111111111111111111111",
      {
        encoding: "jsonParsed",
        filters: [{ memcmp: { offset, bytes: address } }],
      },
    ])) as
      | {
          pubkey?: string;
          account?: {
            lamports?: number;
            data?: { parsed?: { info?: { stake?: { delegation?: { stake?: string } } } } };
          };
        }[]
      | null;
    if (!Array.isArray(result)) continue;
    answered = true;
    for (const row of result) {
      const id = row.pubkey ?? "";
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const delegated = row.account?.data?.parsed?.info?.stake?.delegation?.stake;
      const lamports = row.account?.lamports ?? 0;
      total += delegated ? Number(delegated) : lamports;
    }
  }
  return answered ? total : null;
}

const SOL_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://solana.drpc.org",
  "https://solana.llamarpc.com",
  "https://rpc.ankr.com/solana",
];

async function solRpc(method: string, params: unknown[], timeout = 20000): Promise<unknown | null> {
  for (const url of SOL_RPCS) {
    const data = (await postJson(url, { jsonrpc: "2.0", id: 1, method, params }, timeout)) as {
      result?: unknown;
      error?: unknown;
    } | null;
    if (data && data.result != null && !data.error) return data.result;
  }
  return null;
}

type SolTokenRow = {
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: { amount?: string; decimals?: number; uiAmount?: number };
        };
      };
    };
  };
};

async function solTokenAccounts(address: string, programId: string): Promise<{ ok: boolean; rows: SolTokenRow[] }> {
  let best: SolTokenRow[] = [];
  let ok = false;
  for (const url of SOL_RPCS) {
    const data = (await postJson(
      url,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [address, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }],
      },
      20000,
    )) as { result?: { value?: SolTokenRow[] }; error?: unknown } | null;
    const value = data?.result?.value;
    if (!Array.isArray(value) || data?.error) continue;
    ok = true;
    if (value.length > best.length) best = value;
    if (best.length) return { ok: true, rows: best };
  }
  return { ok, rows: best };
}

async function scanSolana(address: string): Promise<ScanPart> {
  const out: OnchainAsset[] = [];
  const [bal, tokenA, tokenB, stakes] = await Promise.all([
    solRpc("getBalance", [address]),
    solTokenAccounts(address, SOL_TOKEN),
    solTokenAccounts(address, SOL_TOKEN_2022),
    // Stake accounts are a heavy program scan; give up after 25s and keep the stored stake rather than stall the wallet.
    Promise.race([solStakedLamports(address), new Promise<null>((r) => setTimeout(() => r(null), 25000))]),
  ]);
  const balanceOk = bal != null;
  const lamports = typeof bal === "number" ? bal : ((bal as { value?: number } | null)?.value ?? 0);
  if (lamports > 0) {
    out.push({
      chain: "solana",
      tokenKey: "native",
      symbol: "SOL",
      name: "Solana",
      contractAddress: null,
      decimals: 9,
      quantity: lamports / 1e9,
      coingeckoId: "solana",
    });
  }
  if (stakes != null && stakes > 0) {
    out.push({
      chain: "solana",
      tokenKey: "stake",
      symbol: "SOL",
      name: "Staked SOL",
      contractAddress: null,
      decimals: 9,
      quantity: stakes / 1e9,
      coingeckoId: "solana",
    });
  }
  const byMint = new Map<string, { qty: number; decimals: number }>();
  for (const row of [...tokenA.rows, ...tokenB.rows]) {
    const info = row.account?.data?.parsed?.info;
    const mint = info?.mint;
    if (!mint) continue;
    const decimals = info?.tokenAmount?.decimals ?? 0;
    const qty =
      info?.tokenAmount?.uiAmount ?? fromBaseUnits(info?.tokenAmount?.amount ?? "0", decimals);
    if (!qty || qty <= 0) continue;
    const prev = byMint.get(mint);
    byMint.set(mint, { qty: (prev?.qty ?? 0) + qty, decimals });
  }
  const WSOL = "So11111111111111111111111111111111111111112";
  for (const [mint, row] of byMint) {
    if (mint === WSOL) {
      const native = out.find((a) => a.tokenKey === "native");
      if (native) native.quantity += row.qty;
      else {
        out.push({
          chain: "solana",
          tokenKey: "native",
          symbol: "SOL",
          name: "Solana",
          contractAddress: null,
          decimals: 9,
          quantity: row.qty,
          coingeckoId: "solana",
        });
      }
      continue;
    }
    out.push({
      chain: "solana",
      tokenKey: mint,
      symbol: mint.slice(0, 6).toUpperCase(),
      name: mint.slice(0, 8),
      contractAddress: mint,
      decimals: row.decimals,
      quantity: row.qty,
      coingeckoId: null,
    });
  }
  const tokensOk = tokenA.ok && tokenB.ok;
  const keepTokens = stakes == null ? ["stake"] : [];
  if (!balanceOk || !tokensOk) return scanPart(out, [], keepTokens);
  return scanPart(out, ["solana"], keepTokens);
}

/** Tronscan now asks for a key. TronGrid answers without one: TRX plus the two big stablecoins by contract. */
const TRON_TOKENS: Record<string, { symbol: string; name: string; decimals: number; gecko: string }> = {
  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: { symbol: "USDT", name: "Tether USD", decimals: 6, gecko: "tether" },
  TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8: { symbol: "USDC", name: "USD Coin", decimals: 6, gecko: "usd-coin" },
};

async function scanTronGrid(address: string): Promise<ScanPart> {
  const data = (await getJson(`https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}`)) as {
    success?: boolean;
    data?: { balance?: number; trc20?: Record<string, string>[] }[];
  } | null;
  if (!data || data.success === false || !Array.isArray(data.data)) return scanPart([], []);
  // An address that has never received anything comes back as an empty list: a real zero.
  const acct = data.data[0];
  const out: OnchainAsset[] = [];
  const trx = (acct?.balance ?? 0) / 1e6;
  if (trx > 0) {
    out.push({ chain: "tron", tokenKey: "native", symbol: "TRX", name: "TRON", contractAddress: null, decimals: 6, quantity: trx, coingeckoId: "tron" });
  }
  for (const row of acct?.trc20 ?? []) {
    for (const [contract, raw] of Object.entries(row)) {
      const t = TRON_TOKENS[contract];
      if (!t) continue;
      const qty = fromBaseUnits(String(raw), t.decimals);
      if (qty <= 0) continue;
      out.push({ chain: "tron", tokenKey: contract.toLowerCase(), symbol: t.symbol, name: t.name, contractAddress: contract, decimals: t.decimals, quantity: qty, coingeckoId: t.gecko });
    }
  }
  return scanPart(out, ["tron"]);
}

async function scanTron(address: string): Promise<ScanPart> {
  const out: OnchainAsset[] = [];
  const data = (await getJson(
    `https://apilist.tronscanapi.com/api/accountv2?address=${encodeURIComponent(address)}`,
  )) as {
    balance?: number;
    withPriceTokens?: {
      tokenAbbr?: string;
      tokenName?: string;
      tokenDecimal?: number;
      amount?: string | number;
      tokenId?: string;
      tokenType?: string;
    }[];
    trc20token_balances?: {
      tokenAbbr?: string;
      tokenName?: string;
      tokenDecimal?: number;
      balance?: string;
      tokenId?: string;
    }[];
  } | null;
  if (!data) return scanTronGrid(address);
  const trx = (data.balance ?? 0) / 1e6;
  if (trx > 0) {
    out.push({
      chain: "tron",
      tokenKey: "native",
      symbol: "TRX",
      name: "TRON",
      contractAddress: null,
      decimals: 6,
      quantity: trx,
      coingeckoId: "tron",
    });
  }
  const tokens = [...(data.withPriceTokens ?? []), ...(data.trc20token_balances ?? [])];
  const seen = new Set<string>();
  for (const t of tokens) {
    const symbol = (t.tokenAbbr ?? "").toUpperCase();
    if (!symbol || symbol === "TRX") continue;
    const key = (t.tokenId ?? symbol).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const decimals = t.tokenDecimal ?? 6;
    let qty = 0;
    if ("amount" in t && t.amount != null) qty = Number(t.amount);
    else if ("balance" in t && t.balance != null) qty = fromBaseUnits(String(t.balance), decimals);
    if (!qty || qty <= 0) continue;
    out.push({
      chain: "tron",
      tokenKey: key,
      symbol: symbol.slice(0, 16),
      name: (t.tokenName ?? symbol).slice(0, 80),
      contractAddress: t.tokenId && t.tokenId !== "_" ? t.tokenId : null,
      decimals,
      quantity: qty,
      coingeckoId: geckoForSymbol(symbol),
    });
  }
  return scanPart(out, ["tron"]);
}

async function sumBtcAddresses(addrs: string[]): Promise<number | null> {
  let total = 0;
  let any = false;
  for (let i = 0; i < addrs.length; i += 40) {
    const chunk = addrs.slice(i, i + 40);
    const joined = chunk.map(encodeURIComponent).join("|");
    const data = (await getJson(`https://blockchain.info/multiaddr?active=${joined}&n=0`, 20000)) as {
      addresses?: { final_balance?: number }[];
      wallet?: { final_balance?: number };
    } | null;
    const w = data?.wallet?.final_balance;
    if (typeof w === "number" && w > 0) {
      total += w;
      any = true;
      continue;
    }
    if (Array.isArray(data?.addresses)) {
      for (const a of data.addresses) {
        if (typeof a.final_balance === "number") {
          total += a.final_balance;
          any = true;
        }
      }
      continue;
    }
    for (const addr of chunk) {
      const row = (await getJson(`https://blockstream.info/api/address/${addr}`, 8000)) as {
        chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
      } | null;
      const funded = row?.chain_stats?.funded_txo_sum;
      const spent = row?.chain_stats?.spent_txo_sum;
      if (typeof funded === "number") {
        total += funded - (spent ?? 0);
        any = true;
      }
    }
  }
  return any ? total : null;
}

function asSats(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) return Number(n);
  return null;
}

function xpubSats(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const top = asSats(rec.balance) ?? asSats(rec.final_balance) ?? asSats(rec.confirmed);
  if (top != null && top > 0) return top;
  const wallet = rec.wallet as { final_balance?: unknown } | undefined;
  const w = asSats(wallet?.final_balance);
  if (w != null && w > 0) return w;
  const nested = rec.data;
  if (nested && typeof nested === "object") {
    const first = Object.values(nested as Record<string, unknown>)[0] as
      | { xpub?: { balance?: unknown }; address?: { balance?: unknown }; balance?: unknown }
      | undefined;
    const n = asSats(first?.xpub?.balance) ?? asSats(first?.address?.balance) ?? asSats(first?.balance);
    if (n != null) return n;
  }
  return top;
}

async function scanXpub(xpub: string): Promise<ScanPart> {
  const hosts = ["https://btc1.trezor.io", "https://btc2.trezor.io"];
  let sats = 0;
  let found = false;
  // Blockbook only derives the script type implied by the prefix. An account
  // exported as xpub may actually be BIP84 native segwit (zpub) or BIP49 (ypub).
  for (const key of slip132Variants(xpub)) {
    let versionSats: number | null = null;
    for (const host of hosts) {
      const data = await getJson(`${host}/api/v2/xpub/${encodeURIComponent(key)}?details=basic&gap=40`, 20000);
      const n = xpubSats(data);
      if (n != null && n > 0) {
        versionSats = n;
        break;
      }
    }
    if (versionSats != null && versionSats > 0) {
      sats += versionSats;
      found = true;
    }
  }
  if (!found) {
    try {
      const addrs = hdAddresses(xpub);
      const summed = await sumBtcAddresses(addrs);
      if (summed == null) return scanPart([], []);
      sats = summed;
      found = true;
    } catch {
      return scanPart([], []);
    }
  }
  const qty = sats / 1e8;
  if (qty <= 0) return scanPart([], ["bitcoin"]);
  return scanPart([
    {
      chain: "bitcoin",
      tokenKey: "native",
      symbol: "BTC",
      name: "Bitcoin",
      contractAddress: null,
      decimals: 8,
      quantity: qty,
      coingeckoId: "bitcoin",
    },
  ], ["bitcoin"]);
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function toLegacyXpub(extended: string): string | null {
  if (extended.startsWith("xpub")) return null;
  try {
    const bytes = b58decode(extended);
    if (bytes.length < 78) return null;
    bytes[0] = 0x04;
    bytes[1] = 0x88;
    bytes[2] = 0xb2;
    bytes[3] = 0x1e;
    return b58encodeCheck(bytes.slice(0, bytes.length - 4));
  } catch {
    return null;
  }
}

function b58decode(str: string): Uint8Array {
  let num = BigInt(0);
  for (const c of str) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("bad base58");
    num = num * BigInt(58) + BigInt(i);
  }
  const hex = num.toString(16);
  const pad = hex.length % 2 ? `0${hex}` : hex;
  const body = new Uint8Array(pad.length / 2);
  for (let i = 0; i < body.length; i++) body[i] = parseInt(pad.slice(i * 2, i * 2 + 2), 16);
  let zeros = 0;
  for (const c of str) {
    if (c === "1") zeros += 1;
    else break;
  }
  const out = new Uint8Array(zeros + body.length);
  out.set(body, zeros);
  return out;
}

function b58encodeCheck(payload: Uint8Array): string {
  const hash = createHash("sha256").update(createHash("sha256").update(payload).digest()).digest();
  const full = new Uint8Array(payload.length + 4);
  full.set(payload, 0);
  full.set(hash.subarray(0, 4), payload.length);
  let num = BigInt(0);
  for (const b of full) num = num * BigInt(256) + BigInt(b);
  let out = "";
  while (num > 0) {
    const rem = Number(num % BigInt(58));
    num = num / BigInt(58);
    out = B58[rem] + out;
  }
  for (const b of full) {
    if (b === 0) out = `1${out}`;
    else break;
  }
  return out;
}

const SUI_RPCS = [
  "https://fullnode.mainnet.sui.io:443",
  "https://sui-mainnet-endpoint.blockvision.org",
  "https://sui-rpc.publicnode.com",
];

async function suiRpc(method: string, params: unknown[]): Promise<unknown | null> {
  for (const url of SUI_RPCS) {
    const data = (await postJson(url, { jsonrpc: "2.0", id: 1, method, params }, 12000)) as {
      result?: unknown;
      error?: unknown;
    } | null;
    if (data && data.result != null && !data.error) return data.result;
  }
  return null;
}

function normalizeSuiType(coinType: string) {
  const m = coinType.match(/^0x0*([0-9a-fA-F]+)::(.*)$/);
  if (!m) return coinType;
  return `0x${m[1]}::${m[2]}`;
}

async function scanSui(address: string): Promise<ScanPart> {
  const out: OnchainAsset[] = [];
  const balanceRes = (await suiRpc("suix_getAllBalances", [address])) as { coinType?: string; totalBalance?: string }[] | null;
  if (balanceRes == null) return scanPart([], []);
  const balances = balanceRes;
  const have = new Set(balances.map((b) => (b.coinType ?? "").toLowerCase()));
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const coins = (await suiRpc("suix_getAllCoins", [address, cursor, 50])) as {
      data?: { coinType?: string; balance?: string }[];
      nextCursor?: string | null;
      hasNextPage?: boolean;
    } | null;
    const rows = coins?.data ?? [];
    const byType: Record<string, bigint> = {};
    for (const c of rows) {
      const t = c.coinType ?? "";
      if (!t) continue;
      byType[t] = (byType[t] ?? BigInt(0)) + BigInt(c.balance ?? "0");
    }
    for (const [coinType, amt] of Object.entries(byType)) {
      if (have.has(coinType.toLowerCase())) continue;
      have.add(coinType.toLowerCase());
      balances.push({ coinType, totalBalance: amt.toString() });
    }
    if (!coins?.hasNextPage || !coins.nextCursor) break;
    cursor = coins.nextCursor;
  }
  const coinRows = await Promise.all(
    balances.map(async (row) => {
      const coinType = row.coinType ?? "";
      const raw = row.totalBalance ?? "0";
      const isSui = normalizeSuiType(coinType) === "0x2::sui::SUI";
      let decimals = 9;
      let symbol = isSui ? "SUI" : (coinType.split("::").pop() || "TOKEN").slice(0, 16);
      let name = isSui ? "Sui" : symbol;
      if (!isSui) {
        const meta = (await suiRpc("suix_getCoinMetadata", [coinType])) as {
          decimals?: number;
          symbol?: string;
          name?: string;
        } | null;
        if (meta) {
          decimals = meta.decimals ?? decimals;
          symbol = (meta.symbol ?? symbol).slice(0, 16);
          name = (meta.name ?? name).slice(0, 80);
        }
      }
      const qty = fromBaseUnits(raw, decimals);
      if (qty <= 0) return null;
      return {
        chain: "sui",
        tokenKey: isSui ? "native" : coinType,
        symbol: symbol.toUpperCase(),
        name,
        contractAddress: isSui ? "0x2::sui::SUI" : coinType,
        decimals,
        quantity: qty,
        coingeckoId: geckoForSymbol(symbol) ?? (isSui ? "sui" : null),
      } satisfies OnchainAsset;
    }),
  );
  for (const row of coinRows) if (row) out.push(row);

  const stakes = (await suiRpc("suix_getStakes", [address])) as
    | { stakes?: { principal?: string; estimatedReward?: string }[] }[]
    | null;
  let staked = 0;
  for (const pool of stakes ?? []) {
    for (const s of pool.stakes ?? []) {
      staked += fromBaseUnits(s.principal ?? "0", 9) + fromBaseUnits(s.estimatedReward ?? "0", 9);
    }
  }
  if (staked > 0) {
    out.push({
      chain: "sui",
      tokenKey: "stake",
      symbol: "SUI",
      name: "Staked SUI",
      contractAddress: null,
      decimals: 9,
      quantity: staked,
      coingeckoId: "sui",
    });
  }
  return scanPart(out, ["sui"], stakes == null ? ["stake"] : []);
}

const DEBANK_CHAINS: Record<string, string> = {
  eth: "ethereum",
  matic: "polygon",
  op: "optimism",
  arb: "arbitrum",
  base: "base",
  scrl: "scroll",
  xdai: "gnosis",
  bsc: "bsc",
  avax: "avalanche",
  ftm: "fantom",
  sol: "solana",
  hood: "hood",
  opbnb: "opbnb",
  blast: "blast",
  linea: "linea",
  mnt: "mantle",
  era: "zksync",
  cro: "cronos",
};

async function scanDefi(address: string): Promise<{ assets: OnchainAsset[]; failed: boolean }> {
  const url = `https://api.rabby.io/v1/user/complex_protocol_list?id=${encodeURIComponent(address)}`;
  type Protocol = {
    id?: string;
    name?: string;
    chain?: string;
    portfolio_item_list?: {
      name?: string;
      stats?: { net_usd_value?: number };
      asset_token_list?: { symbol?: string; amount?: number; price?: number; id?: string }[];
    }[];
  };
  const data = (await getJson(url, 14000)) as Protocol[] | { data?: Protocol[] } | null;
  if (data == null) return { assets: [], failed: true };
  const list: Protocol[] = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : [];
  const out: OnchainAsset[] = [];
  for (const proto of list) {
    const protocol = (proto.name ?? proto.id ?? "DeFi").slice(0, 40);
    const chain = DEBANK_CHAINS[proto.chain ?? ""] ?? proto.chain ?? "defi";
    for (const [i, item] of (proto.portfolio_item_list ?? []).entries()) {
      const tokens = item.asset_token_list ?? [];
      if (tokens.length) {
        for (const [j, tok] of tokens.entries()) {
          const qty = Number(tok.amount ?? 0);
          const price = Number(tok.price ?? 0);
          if (qty <= 0 && price * qty < 1) continue;
          if (qty <= 0) continue;
          const symbol = (tok.symbol ?? protocol).toUpperCase().slice(0, 16);
          out.push({
            chain,
            tokenKey: `defi:${proto.id ?? protocol}:${i}:${j}`,
            symbol,
            name: `${protocol} · ${item.name ?? symbol}`.slice(0, 80),
            contractAddress: tok.id && tok.id.startsWith("0x") ? tok.id.toLowerCase() : null,
            decimals: 18,
            quantity: qty,
            coingeckoId: geckoForSymbol(symbol),
            quotePrice: price > 0 ? price : null,
          });
        }
      } else {
        const usd = Number(item.stats?.net_usd_value ?? 0);
        if (usd < 1) continue;
        out.push({
          chain: "defi",
          tokenKey: `defi:${proto.id ?? protocol}:${i}`,
          symbol: protocol.replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase() || "DEFI",
          name: `${protocol} · ${item.name ?? "Position"}`.slice(0, 80),
          contractAddress: null,
          decimals: 0,
          quantity: usd,
          coingeckoId: null,
          quotePrice: 1,
        });
      }
    }
  }
  return { assets: out, failed: false };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function scanSolanaDefi(address: string): Promise<{ assets: OnchainAsset[]; keepTokens: string[] }> {
  const out: OnchainAsset[] = [];
  const kamino = (await getJson(`https://api.kamino.finance/portfolio/${encodeURIComponent(address)}`, 15000)) as {
    lending?: KaminoPos[];
    multiply?: KaminoPos[];
    leverage?: KaminoPos[];
    liquidity?: { strategy?: string; netValue?: string; tokenA?: { symbol?: string }; tokenB?: { symbol?: string } }[];
    earn?: { vault?: string; symbol?: string; name?: string; netValue?: string; amount?: string }[];
    privateCredit?: { vault?: string; symbol?: string; name?: string; netValue?: string }[];
    staking?: { mint?: string; symbol?: string; amount?: string; value?: string; price?: string }[];
  } | null;

  type KaminoPos = {
    obligation?: string;
    tag?: string;
    netValue?: string;
    leverage?: string;
    deposits?: { mint?: string; symbol?: string; amount?: string; value?: string; price?: string }[];
    borrows?: { mint?: string; symbol?: string; amount?: string; value?: string; price?: string }[];
  };

  const pushUsd = (tokenKey: string, symbol: string, name: string, usd: number, mint?: string | null, price?: number) => {
    if (!(usd >= 1 || (price && price > 0))) return;
    if (usd < 1 && !(price && price > 0)) return;
    const qty = price && price > 0 ? usd / price : usd;
    const px = price && price > 0 ? price : 1;
    if (qty * px < 1) return;
    out.push({
      chain: "solana",
      tokenKey,
      symbol: symbol.slice(0, 16),
      name: name.slice(0, 80),
      contractAddress: mint ?? null,
      decimals: 0,
      quantity: qty,
      coingeckoId: geckoForSymbol(symbol),
      quotePrice: px,
    });
  };

  const sections: { key: string; label: string; rows: KaminoPos[] | undefined }[] = [
    { key: "lending", label: "Kamino Lend", rows: kamino?.lending },
    { key: "multiply", label: "Kamino Multiply", rows: kamino?.multiply },
    { key: "leverage", label: "Kamino Leverage", rows: kamino?.leverage },
  ];
  for (const sec of sections) {
    for (const [i, pos] of (sec.rows ?? []).entries()) {
      const net = num(pos.netValue);
      const coll = pos.deposits?.[0];
      const symbol = (coll?.symbol ?? "USD").toUpperCase();
      const lev = num(pos.leverage);
      const tag = pos.tag && pos.tag !== "Vanilla" ? pos.tag : sec.label.replace("Kamino ", "");
      const name =
        lev > 1.05 ? `Kamino ${tag} · ${symbol} ${lev.toFixed(1)}x` : `Kamino ${tag} · ${symbol}`;
      pushUsd(`defi:kamino:${sec.key}:${pos.obligation ?? i}`, symbol, name, net, coll?.mint, num(coll?.price) || undefined);
    }
  }
  for (const [i, pos] of (kamino?.liquidity ?? []).entries()) {
    const net = num(pos.netValue);
    const pair = [pos.tokenA?.symbol, pos.tokenB?.symbol].filter(Boolean).join("/");
    pushUsd(`defi:kamino:lp:${pos.strategy ?? i}`, pair || "LP", `Kamino Liquidity · ${pair || "Pool"}`, net);
  }
  for (const [i, pos] of (kamino?.earn ?? []).entries()) {
    pushUsd(
      `defi:kamino:earn:${pos.vault ?? i}`,
      (pos.symbol ?? "USD").toUpperCase(),
      `Kamino Earn · ${pos.name ?? pos.symbol ?? "Vault"}`,
      num(pos.netValue),
    );
  }
  for (const [i, pos] of (kamino?.privateCredit ?? []).entries()) {
    pushUsd(
      `defi:kamino:pc:${pos.vault ?? i}`,
      (pos.symbol ?? "USD").toUpperCase(),
      `Kamino · ${pos.name ?? "Private credit"}`,
      num(pos.netValue),
    );
  }
  for (const [i, pos] of (kamino?.staking ?? []).entries()) {
    const usd = num(pos.value);
    const qty = num(pos.amount);
    const px = num(pos.price) || (qty > 0 ? usd / qty : 0);
    if (usd < 1 && qty * px < 1) continue;
    out.push({
      chain: "solana",
      tokenKey: `defi:kamino:stake:${pos.mint ?? i}`,
      symbol: (pos.symbol ?? "TOKEN").toUpperCase().slice(0, 16),
      name: `Kamino Stake · ${pos.symbol ?? "Token"}`.slice(0, 80),
      contractAddress: pos.mint ?? null,
      decimals: 0,
      quantity: qty || usd,
      coingeckoId: geckoForSymbol(pos.symbol ?? ""),
      quotePrice: px || 1,
    });
  }

  const keepTokens = kamino == null ? ["defi:kamino:"] : [];
  const jupUrls = [
    `https://lite-api.jup.ag/lend/v1/earn/positions/${encodeURIComponent(address)}`,
    `https://api.jup.ag/lend/v1/earn/positions/${encodeURIComponent(address)}`,
  ];
  let jupiterAnswered = false;
  for (const url of jupUrls) {
    const data = (await getJson(url, 10000)) as
      | { token?: { symbol?: string; address?: string }; shares?: string; underlyingAssets?: string; usdValue?: number }[]
      | { positions?: { token?: { symbol?: string }; usdValue?: number }[] }
      | null;
    if (data == null) continue;
    jupiterAnswered = true;
    const list = Array.isArray(data) ? data : data.positions ?? [];
    if (!list.length) break;
    for (const [i, pos] of list.entries()) {
      const usd = num((pos as { usdValue?: number }).usdValue);
      const symbol = ((pos as { token?: { symbol?: string } }).token?.symbol ?? "JUP").toUpperCase();
      pushUsd(`defi:jupiter:${i}:${symbol}`, symbol, `Jupiter Lend · ${symbol}`, usd);
    }
    break;
  }
  if (!jupiterAnswered) keepTokens.push("defi:jupiter:");

  return { assets: out, keepTokens };
}

async function cosmosLcd(net: CosmosNet, path: string): Promise<unknown | null> {
  for (const base of net.lcds) {
    const data = await getJson(`${base.replace(/\/$/, "")}${path}`, 12000);
    if (!data || typeof data !== "object") continue;
    const rec = data as { code?: unknown; message?: unknown };
    if (rec.code != null && rec.code !== 0) continue;
    if (typeof rec.message === "string" && !("balances" in data || "delegation_responses" in data || "total" in data)) {
      continue;
    }
    return data;
  }
  return null;
}

function cosmosUnits(amount: string | undefined, decimals: number) {
  if (!amount) return 0;
  return fromBaseUnits(amount, decimals);
}

function knownCosmosAsset(denom: string): { symbol: string; name: string; decimals: number; gecko: string | null } | null {
  const leaf = (denom.split("/").pop() ?? denom).toLowerCase();
  const blob = denom.toLowerCase();
  if (leaf === "inj" || leaf === "uinj") {
    return { symbol: "INJ", name: "Injective", decimals: 18, gecko: "injective-protocol" };
  }
  if (leaf.includes("wbtc") || leaf === "wbtc-satoshi") {
    return { symbol: "WBTC", name: "Wrapped Bitcoin", decimals: 8, gecko: "wrapped-bitcoin" };
  }
  if (leaf === "allbtc" || leaf === "allwbtc") {
    return { symbol: "BTC", name: "Bitcoin", decimals: 8, gecko: "bitcoin" };
  }
  if (leaf === "weth" || leaf === "ueth" || (blob.includes("weth") && leaf.includes("eth"))) {
    return { symbol: "WETH", name: "WETH", decimals: 18, gecko: "weth" };
  }
  if (leaf === "uusdc" || leaf === "usdc") {
    return { symbol: "USDC", name: "USD Coin", decimals: 6, gecko: "usd-coin" };
  }
  if (leaf === "uusdt" || leaf === "usdt") {
    return { symbol: "USDT", name: "Tether", decimals: 6, gecko: "tether" };
  }
  return null;
}

async function resolveCosmosDenom(net: CosmosNet, denom: string): Promise<{
  symbol: string;
  name: string;
  decimals: number;
  gecko: string | null;
}> {
  if (denom === net.nativeDenom) {
    return { symbol: net.symbol, name: net.name, decimals: net.decimals, gecko: net.gecko };
  }
  const known = knownCosmosAsset(denom);
  if (known) return known;
  if (denom.startsWith("ibc/")) {
    const hash = denom.slice(4);
    const trace = (await cosmosLcd(net, `/ibc/apps/transfer/v1/denom_traces/${hash}`)) as {
      denom_trace?: { base_denom?: string };
    } | null;
    const base = trace?.denom_trace?.base_denom;
    if (base && !base.startsWith("ibc/")) {
      const traced = knownCosmosAsset(base);
      if (traced) return traced;
      if (base === net.nativeDenom) {
        return { symbol: net.symbol, name: net.name, decimals: net.decimals, gecko: net.gecko };
      }
    }
  }
  const meta = (await cosmosLcd(net, `/cosmos/bank/v1beta1/denoms_metadata/${encodeURIComponent(denom)}`)) as {
    metadata?: { symbol?: string; display?: string; name?: string; denom_units?: { denom?: string; exponent?: number; aliases?: string[] }[] };
  } | null;
  const m = meta?.metadata;
  if (m) {
    const display = (m.display || m.symbol || "").toUpperCase();
    const unit = m.denom_units?.find((u) => u.denom === m.display) ?? m.denom_units?.[m.denom_units.length - 1];
    const decimals = typeof unit?.exponent === "number" ? unit.exponent : 6;
    const symbol = (display || denom.slice(0, 8).toUpperCase()).slice(0, 16);
    const hinted = knownCosmosAsset(symbol) ?? knownCosmosAsset(display.toLowerCase());
    return {
      symbol: hinted?.symbol ?? symbol,
      name: (hinted?.name || m.name || symbol).slice(0, 80),
      decimals: hinted?.decimals ?? decimals,
      gecko: hinted?.gecko ?? geckoForSymbol(symbol),
    };
  }
  if (denom.startsWith("factory/")) {
    const sub = denom.split("/").pop() || denom;
    const hinted = knownCosmosAsset(sub);
    if (hinted) return hinted;
    const symbol = sub.replace(/^u/, "").toUpperCase().slice(0, 16);
    return { symbol, name: symbol, decimals: 6, gecko: geckoForSymbol(symbol) };
  }
  const stripped = denom.startsWith("u") && denom.length <= 8 ? denom.slice(1) : denom;
  const symbol = stripped.toUpperCase().slice(0, 16);
  return { symbol, name: symbol, decimals: 6, gecko: geckoForSymbol(symbol) };
}

function cosmosAddressOn(address: string, hrp: string): string | null {
  try {
    const decoded = bech32.decode(address, false);
    return bech32.encode(hrp, decoded.words, false);
  } catch {
    return null;
  }
}

async function scanCosmosChain(
  net: CosmosNet,
  address: string,
): Promise<{ assets: OnchainAsset[]; confirmed: boolean; keepStake: boolean }> {
  const out: OnchainAsset[] = [];
  const enc = encodeURIComponent(address);

  const bank = (await cosmosLcd(net, `/cosmos/bank/v1beta1/balances/${enc}?pagination.limit=200`)) as {
    balances?: { denom?: string; amount?: string }[];
  } | null;
  if (bank == null) return { assets: [], confirmed: false, keepStake: true };
  const rows = (bank.balances ?? []).filter((row) => row.denom && row.amount && row.amount !== "0");
  const resolved = await Promise.all(
    rows.slice(0, 40).map(async (row) => {
      const denom = row.denom!;
      const info = await resolveCosmosDenom(net, denom);
      const qty = cosmosUnits(row.amount, info.decimals);
      if (qty <= 0) return null;
      const asset: OnchainAsset = {
        chain: net.chain,
        tokenKey: denom === net.nativeDenom ? "native" : denom,
        symbol: info.symbol,
        name: info.name,
        contractAddress: denom.startsWith("ibc/") || denom.startsWith("factory/") ? denom : null,
        decimals: info.decimals,
        quantity: qty,
        coingeckoId: info.gecko,
      };
      return asset;
    }),
  );
  for (const a of resolved) if (a) out.push(a);

  const [dels, unbond, rewards] = await Promise.all([
    cosmosLcd(net, `/cosmos/staking/v1beta1/delegations/${enc}`) as Promise<{
      delegation_responses?: { balance?: { amount?: string; denom?: string } }[];
    } | null>,
    cosmosLcd(net, `/cosmos/staking/v1beta1/delegators/${enc}/unbonding_delegations`) as Promise<{
      unbonding_responses?: { entries?: { balance?: string }[] }[];
    } | null>,
    cosmosLcd(net, `/cosmos/distribution/v1beta1/delegators/${enc}/rewards`) as Promise<{
      total?: { denom?: string; amount?: string }[];
    } | null>,
  ]);
  let staked = 0;
  for (const d of dels?.delegation_responses ?? []) {
    staked += cosmosUnits(d.balance?.amount, net.decimals);
  }
  for (const u of unbond?.unbonding_responses ?? []) {
    for (const e of u.entries ?? []) staked += cosmosUnits(e.balance, net.decimals);
  }
  const rewardAmt = (rewards?.total ?? [])
    .filter((c) => c.denom === net.nativeDenom)
    .reduce((s, c) => s + cosmosUnits(c.amount, net.decimals), 0);
  const bonded = staked + rewardAmt;
  if (bonded > 0) {
    out.push({
      chain: net.chain,
      tokenKey: "stake",
      symbol: net.symbol,
      name: `Staked ${net.symbol}`,
      contractAddress: null,
      decimals: net.decimals,
      quantity: bonded,
      coingeckoId: net.gecko,
    });
  }
  return { assets: out, confirmed: true, keepStake: dels == null && unbond == null };
}

async function scanCosmos(address: string): Promise<ScanPart> {
  const originHrp = address.split("1")[0] ?? "";
  const originType = cosmosCoinType(originHrp);
  const targets: { net: CosmosNet; addr: string }[] = [];
  for (const [hrp, net] of Object.entries(COSMOS_HRP)) {
    if (cosmosCoinType(hrp) !== originType) continue;
    if (hrp === "secret" && originHrp !== "secret") continue;
    const addr = hrp === originHrp ? address : cosmosAddressOn(address, hrp);
    if (!addr) continue;
    targets.push({ net, addr });
  }
  const out: OnchainAsset[] = [];
  const confirmed: string[] = [];
  let keepStake = false;
  for (let i = 0; i < targets.length; i += 4) {
    const batch = targets.slice(i, i + 4);
    const parts = await Promise.all(
      batch.map(async (t) => {
        try {
          const row = await scanCosmosChain(t.net, t.addr);
          return { ...row, chain: t.net.chain };
        } catch {
          return { assets: [] as OnchainAsset[], confirmed: false, keepStake: true, chain: t.net.chain };
        }
      }),
    );
    for (const part of parts) {
      if (part.confirmed) confirmed.push(part.chain);
      if (part.keepStake) keepStake = true;
      mergeAssets(out, part.assets);
    }
  }
  return scanPart(out, confirmed, keepStake ? ["stake"] : []);
}

/**
 * EVM chains with a keyless public RPC. When a chain's explorer (or Rabby) doesn't answer, its native balance, the
 * tokens already on file, and the stablecoins below are read straight from the RPC, so the wallet keeps updating.
 * Other new tokens still need an explorer to be found. Several RPCs per chain are tried in order.
 */
type RpcChain = {
  rpcs: string[];
  symbol: string;
  name: string;
  gecko: string;
  tokens: [symbol: string, name: string, contract: string, decimals: number, gecko: string][];
};

export const RPC_CHAINS: Record<string, RpcChain> = {
  ethereum: {
    rpcs: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com", "https://cloudflare-eth.com"],
    symbol: "ETH",
    name: "Ether",
    gecko: "ethereum",
    tokens: [
      ["USDC", "USD Coin", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 6, "usd-coin"],
      ["USDT", "Tether USD", "0xdac17f958d2ee523a2206206994597c13d831ec7", 6, "tether"],
    ],
  },
  base: {
    rpcs: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
    symbol: "ETH",
    name: "Ether",
    gecko: "ethereum",
    tokens: [["USDC", "USD Coin", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 6, "usd-coin"]],
  },
  arbitrum: {
    rpcs: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"],
    symbol: "ETH",
    name: "Ether",
    gecko: "ethereum",
    tokens: [
      ["USDC", "USD Coin", "0xaf88d065e77c8cc2239327c5edb3a432268e5831", 6, "usd-coin"],
      ["USDT", "Tether USD", "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", 6, "tether"],
    ],
  },
  optimism: {
    rpcs: ["https://optimism-rpc.publicnode.com", "https://mainnet.optimism.io"],
    symbol: "ETH",
    name: "Ether",
    gecko: "ethereum",
    tokens: [
      ["USDC", "USD Coin", "0x0b2c639c533813f4aa9d7837caf62653d097ff85", 6, "usd-coin"],
      ["USDT", "Tether USD", "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", 6, "tether"],
    ],
  },
  polygon: {
    rpcs: ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com"],
    symbol: "POL",
    name: "Polygon",
    gecko: "polygon-ecosystem-token",
    tokens: [
      ["USDC", "USD Coin", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", 6, "usd-coin"],
      ["USDT", "Tether USD", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", 6, "tether"],
    ],
  },
  bsc: {
    rpcs: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.binance.org"],
    symbol: "BNB",
    name: "BNB",
    gecko: "binancecoin",
    tokens: [
      ["USDC", "USD Coin", "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", 18, "usd-coin"],
      ["USDT", "Tether USD", "0x55d398326f99059ff775485246999027b3197955", 18, "tether"],
    ],
  },
  avalanche: {
    rpcs: ["https://avalanche-c-chain-rpc.publicnode.com", "https://api.avax.network/ext/bc/C/rpc"],
    symbol: "AVAX",
    name: "Avalanche",
    gecko: "avalanche-2",
    tokens: [
      ["USDC", "USD Coin", "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", 6, "usd-coin"],
      ["USDT", "Tether USD", "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", 6, "tether"],
    ],
  },
  hood: { rpcs: ["https://rpc.mainnet.chain.robinhood.com"], symbol: "ETH", name: "Ether", gecko: "ethereum", tokens: [] },
};

/** Each RPC call gets this long, so one slow chain cannot hold the others up. */
const RPC_TIMEOUT_MS = 8000;

export type KnownToken = Pick<OnchainAsset, "chain" | "tokenKey" | "symbol" | "name" | "contractAddress" | "decimals" | "coingeckoId" | "quotePrice">;

async function rpcCall(urls: string[], method: string, params: unknown[]): Promise<string | null> {
  for (const url of urls) {
    const data = (await postJson(url, { jsonrpc: "2.0", id: 1, method, params }, RPC_TIMEOUT_MS)) as {
      result?: unknown;
      error?: unknown;
    } | null;
    if (typeof data?.result === "string" && !data.error) return data.result;
  }
  return null;
}

function hexUnits(hex: string, decimals: number) {
  return fromBaseUnits(BigInt(hex === "0x" ? "0x0" : hex).toString(), decimals);
}

/** Native, known-token and stablecoin balances for one chain, from its RPC. Null when any read fails, so nothing is dropped. */
export async function readKnownFromRpc(chain: string, address: string, known: KnownToken[]): Promise<OnchainAsset[] | null> {
  const meta = RPC_CHAINS[chain];
  if (!meta || !/^0x[a-f0-9]{40}$/i.test(address)) return null;
  const native = await rpcCall(meta.rpcs, "eth_getBalance", [address, "latest"]);
  if (native == null) return null;
  const out: OnchainAsset[] = [];
  const nativeQty = hexUnits(native, 18);
  const nativeKnown = known.find((k) => k.chain === chain && !k.contractAddress);
  if (nativeQty > 0) {
    out.push({
      chain,
      tokenKey: "native",
      symbol: meta.symbol,
      name: meta.name,
      contractAddress: null,
      decimals: 18,
      quantity: nativeQty,
      coingeckoId: meta.gecko,
      quotePrice: nativeKnown?.quotePrice ?? null,
    });
  }
  const tokens = new Map<string, KnownToken>();
  for (const [symbol, name, contract, decimals, gecko] of meta.tokens) {
    tokens.set(contract, { chain, tokenKey: contract, symbol, name, contractAddress: contract, decimals, coingeckoId: gecko, quotePrice: null });
  }
  for (const k of known) if (k.chain === chain && k.contractAddress) tokens.set(k.contractAddress.toLowerCase(), k);
  const selector = "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0");
  const reads = await Promise.all(
    [...tokens.values()].map(async (k) => ({
      k,
      raw: await rpcCall(meta.rpcs, "eth_call", [{ to: k.contractAddress, data: selector }, "latest"]),
    })),
  );
  for (const { k, raw } of reads) {
    if (raw == null) return null;
    const qty = hexUnits(raw, k.decimals);
    if (qty > 0) out.push({ ...k, quantity: qty, quotePrice: k.quotePrice ?? null });
  }
  return out;
}

export async function scanAddress(raw: string, known: KnownToken[] = []): Promise<{
  type: AddressType;
  address: string;
  assets: OnchainAsset[];
  /** Chains whose lookup finished. Rows on any other chain are left in place. */
  confirmedChains: string[];
  /** Exact token keys, or prefixes ending in ":", that this scan must not delete. */
  keepTokens: string[];
}> {
  const classified = classifyAddress(raw);
  if (!classified) {
    throw new Error("Unrecognized wallet address. Use a Bitcoin, Litecoin or Dogecoin address (or a BTC xpub), an EVM 0x address or ENS name, Solana, TRON, Sui, or Cosmos (cosmos1…).");
  }
  const { type } = classified;
  let { address } = classified;
  if (type === "evm" && address.endsWith(".eth")) {
    const resolved = await resolveEns(address);
    if (!resolved) throw new Error("Could not resolve that ENS name.");
    address = resolved;
  }
  let part = scanPart([], []);
  if (type === "bitcoin") part = await scanBitcoin(address);
  else if (type === "xpub") part = await scanXpub(address);
  else if (type === "evm") {
    part = await scanEvm(address);
    // Each EVM chain that no explorer confirmed is read from its own RPC, all at once and independently.
    const rpcChains = Object.keys(RPC_CHAINS).filter((c) => !part.confirmedChains.includes(c));
    const reads = await Promise.all(rpcChains.map((c) => readKnownFromRpc(c, address, known).catch(() => null)));
    rpcChains.forEach((chain, i) => {
      const fromRpc = reads[i];
      if (fromRpc == null) return;
      mergeAssets(part.assets, fromRpc);
      part.confirmedChains.push(chain);
    });
  }
  else if (type === "solana") part = await scanSolana(address);
  else if (type === "tron") part = await scanTron(address);
  else if (type === "sui") part = await scanSui(address);
  else if (type === "litecoin" || type === "dogecoin") part = await scanBlockcypher(type, address);
  else if (type === "cosmos") part = await scanCosmos(address);

  const assets = part.assets;
  const keepTokens = [...part.keepTokens];
  if (type === "evm" || type === "solana") {
    const defi = await scanDefi(address).catch(() => ({ assets: [] as OnchainAsset[], failed: true }));
    if (defi.failed) keepTokens.push("defi:");
    else mergeAssets(assets, defi.assets);
  }
  if (type === "solana") {
    const solDefi = await scanSolanaDefi(address).catch(() => ({
      assets: [] as OnchainAsset[],
      keepTokens: ["defi:kamino:", "defi:jupiter:"],
    }));
    keepTokens.push(...solDefi.keepTokens);
    mergeAssets(assets, solDefi.assets);
  }
  const priced = significantOnly(await attachPrices(dropFakeStables(collapseDuplicateSpot(assets))));
  return { type, address, assets: priced, confirmedChains: part.confirmedChains, keepTokens };
}

export function isDefiAsset(a: { tokenKey?: string | null }) {
  return (a.tokenKey ?? "").startsWith("defi:");
}

export function shortAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
