const INSTITUTION_DOMAINS: Record<string, string> = {
  chase: "chase.com",
  "jpmorgan": "jpmorganchase.com",
  "jp morgan": "jpmorganchase.com",
  "bank of america": "bankofamerica.com",
  wells: "wellsfargo.com",
  sofi: "sofi.com",
  robinhood: "robinhood.com",
  fidelity: "fidelity.com",
  vanguard: "vanguard.com",
  schwab: "schwab.com",
  wealthfront: "wealthfront.com",
  betterment: "betterment.com",
  ally: "ally.com",
  capital: "capitalone.com",
  amex: "americanexpress.com",
  "american express": "americanexpress.com",
  citi: "citi.com",
  citibank: "citi.com",
  discover: "discover.com",
  usaa: "usaa.com",
  pnc: "pnc.com",
  "td bank": "td.com",
  "e*trade": "etrade.com",
  etrade: "etrade.com",
  merrill: "ml.com",
  tiaa: "tiaa.org",
  "navy federal": "navyfederal.org",
  "goldman": "goldmansachs.com",
  "morgan stanley": "morganstanley.com",
  "interactive brokers": "interactivebrokers.com",
  coinbase: "coinbase.com",
  acorns: "acorns.com",
  "marcus": "marcus.com",
  "first republic": "firstrepublic.com",
  "us bank": "usbank.com",
  "truist": "truist.com",
  "regions": "regions.com",
  "fifth third": "53.com",
  "huntington": "huntington.com",
  "synchrony": "synchrony.com",
  "barclays": "barclays.com",
  "hsbc": "hsbc.com",
};

const MERCHANT_DOMAINS: Record<string, string> = {
  amazon: "amazon.com",
  "whole foods": "wholefoodsmarket.com",
  starbucks: "starbucks.com",
  walmart: "walmart.com",
  target: "target.com",
  costco: "costco.com",
  netflix: "netflix.com",
  uber: "uber.com",
  lyft: "lyft.com",
  spotify: "spotify.com",
  apple: "apple.com",
  google: "google.com",
  youtube: "youtube.com",
  microsoft: "microsoft.com",
  adobe: "adobe.com",
  chevron: "chevron.com",
  shell: "shell.com",
  exxon: "exxon.com",
  "home depot": "homedepot.com",
  lowes: "lowes.com",
  mcdonald: "mcdonalds.com",
  chipotle: "chipotle.com",
  doordash: "doordash.com",
  instacart: "instacart.com",
  paypal: "paypal.com",
  venmo: "venmo.com",
  visa: "visa.com",
  delta: "delta.com",
  united: "united.com",
  southwest: "southwest.com",
  airbnb: "airbnb.com",
  marriott: "marriott.com",
  hilton: "hilton.com",
  cvs: "cvs.com",
  walgreens: "walgreens.com",
  "trader joe": "traderjoes.com",
  kroger: "kroger.com",
  safeway: "safeway.com",
  comcast: "xfinity.com",
  verizon: "verizon.com",
  att: "att.com",
  "t-mobile": "t-mobile.com",
  "t mobile": "t-mobile.com",
};

function matchDomain(name: string, map: Record<string, string>) {
  const n = name.toLowerCase();
  let best: { key: string; domain: string } | null = null;
  for (const [key, domain] of Object.entries(map)) {
    if (n.includes(key) && (!best || key.length > best.key.length)) best = { key, domain };
  }
  return best?.domain ?? null;
}

function slugDomain(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(inc|llc|corp|co|ltd|the|store|market)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
  if (slug.length < 4) return null;
  return `${slug}.com`;
}

export function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

export function securityLogoUrl(symbol: string) {
  return `https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol.toUpperCase())}`;
}

export function cryptoLogoUrl(symbol: string) {
  return `https://assets.coincap.io/assets/icons/${encodeURIComponent(symbol.toLowerCase())}@2x.png`;
}

/** Symbol-keyed sources tried in order when we have no CoinGecko image for a token. */
export function cryptoLogoCandidates(symbol: string) {
  const s = symbol.toLowerCase();
  return [
    cryptoLogoUrl(s),
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${encodeURIComponent(s)}.png`,
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${encodeURIComponent(s)}.png`,
  ];
}

const CHAIN_LOGO: Record<string, { symbol?: string; src?: string; name: string }> = {
  solana: { symbol: "sol", name: "Solana" },
  sui: { symbol: "sui", name: "Sui" },
  bitcoin: { symbol: "btc", name: "Bitcoin" },
  xpub: { symbol: "btc", name: "Bitcoin" },
  tron: { symbol: "trx", name: "TRON" },
  cosmos: { symbol: "atom", name: "Cosmos" },
  osmosis: { symbol: "osmo", name: "Osmosis" },
  kujira: { symbol: "kuji", name: "Kujira" },
  injective: { symbol: "inj", name: "Injective" },
  celestia: { symbol: "tia", name: "Celestia" },
  juno: { symbol: "juno", name: "Juno" },
  neutron: { symbol: "ntrn", name: "Neutron" },
  stride: { symbol: "strd", name: "Stride" },
  ethereum: { symbol: "eth", name: "Ethereum" },
  evm: { symbol: "eth", name: "Ethereum" },
  hood: { src: faviconUrl("robinhood.com"), name: "Robinhood Chain" },
  base: { symbol: "eth", name: "Base" },
  polygon: { symbol: "matic", name: "Polygon" },
  arbitrum: { symbol: "eth", name: "Arbitrum" },
  bsc: { symbol: "bnb", name: "BNB Chain" },
  avalanche: { symbol: "avax", name: "Avalanche" },
};

export function chainBrand(addressType: string, assetChains?: string[]) {
  const chains = assetChains ?? [];
  if (chains.includes("hood")) return { ...CHAIN_LOGO.hood, kind: "institution" as const };
  const key = chains.length === 1 ? chains[0] : addressType;
  const hit = CHAIN_LOGO[key] ?? CHAIN_LOGO[addressType] ?? CHAIN_LOGO.evm;
  return {
    kind: "crypto" as const,
    symbol: hit.symbol ?? null,
    src: hit.src ?? (hit.symbol ? cryptoLogoUrl(hit.symbol) : null),
    name: hit.name,
  };
}

export function institutionLogoUrl(name: string | null | undefined) {
  if (!name) return null;
  const domain = matchDomain(name, INSTITUTION_DOMAINS) ?? slugDomain(name);
  return domain ? faviconUrl(domain) : null;
}

export function merchantLogoUrl(name: string | null | undefined) {
  if (!name) return null;
  const domain = matchDomain(name, MERCHANT_DOMAINS) ?? slugDomain(name);
  return domain ? faviconUrl(domain) : null;
}

export type BrandKind = "merchant" | "institution" | "security" | "crypto";

export function brandLogoUrl(
  kind: BrandKind,
  opts: { name?: string | null; symbol?: string | null; src?: string | null },
) {
  return brandLogoCandidates(kind, opts)[0] ?? null;
}

/** Ordered list of URLs to try; the mark falls through on 404 before showing an initial. */
export function brandLogoCandidates(
  kind: BrandKind,
  opts: { name?: string | null; symbol?: string | null; src?: string | null },
): string[] {
  const out: string[] = [];
  if (opts.src) out.push(opts.src);
  if (kind === "crypto" && opts.symbol) out.push(...cryptoLogoCandidates(opts.symbol));
  else if (kind === "security" && opts.symbol) out.push(securityLogoUrl(opts.symbol));
  else if (kind === "institution") {
    const u = institutionLogoUrl(opts.name);
    if (u) out.push(u);
  } else if (kind === "merchant") {
    const u = merchantLogoUrl(opts.name);
    if (u) out.push(u);
  }
  return out;
}
