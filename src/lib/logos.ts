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

/** Well-known aliases where the public domain is not an obvious `{name}.com` slug. */
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

export function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

export function logoTicker(symbol: string): string | null {
  const raw = symbol.trim().toUpperCase().replace(/\s+/g, "");
  const occ = raw.match(/^([A-Z]{1,6})\d{6}[CP]\d{8}$/);
  const ticker = occ?.[1] ?? raw;
  if (!/^[A-Z]{1,5}([.\-][A-Z])?$/.test(ticker)) return null;
  return ticker;
}

export function securityLogoUrl(symbol: string) {
  const ticker = logoTicker(symbol);
  if (!ticker) return null;
  return `/api/symbol-logo?symbol=${encodeURIComponent(ticker)}`;
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
  const domain = matchDomain(name, INSTITUTION_DOMAINS);
  return domain ? faviconUrl(domain) : null;
}

const GUESS_SKIP = new Set([
  "interest",
  "transfer",
  "payment",
  "payments",
  "payroll",
  "deposit",
  "check",
  "fee",
  "fees",
  "refund",
  "income",
  "salary",
  "other",
  "cash",
  "savings",
  "checking",
  "debit",
  "credit",
  "wire",
  "atm",
  "purchase",
  "online",
  "store",
  "market",
  "bank",
  "card",
  "pending",
  "withdrawal",
  "adjustment",
  "dividend",
  "dividends",
  "the",
  "and",
  "whse",
  "warehouse",
  "inc",
  "llc",
  "ltd",
  "corp",
  "co",
]);

/** Slugs whose public site is not `{slug}.com`. */
const DOMAIN_OVERRIDE: Record<string, string> = {
  xai: "x.ai",
  claude: "claude.ai",
  notion: "notion.so",
  zoom: "zoom.us",
};

function guessDomain(slug: string): string | null {
  if (GUESS_SKIP.has(slug)) return null;
  if (DOMAIN_OVERRIDE[slug]) return DOMAIN_OVERRIDE[slug];
  if (slug.length < 4) return null;
  return `${slug}.com`;
}

/**
 * Likely domains for a merchant name.
 * Known brands / institutions resolve from the maps. Otherwise the name is cleaned
 * (processor prefixes, store numbers, punctuation) and we guess `{slug}.com` from
 * the leading one or two tokens. BrandMark falls through to an initial when the
 * favicon request 404s.
 */
export function merchantDomains(name: string | null | undefined): string[] {
  if (!name) return [];
  const out: string[] = [];
  const push = (domain: string | null | undefined) => {
    if (domain && !out.includes(domain)) out.push(domain);
  };
  push(matchDomain(name, MERCHANT_DOMAINS));
  push(matchDomain(name, INSTITUTION_DOMAINS));
  const embedded = name.toLowerCase().match(/\b([a-z0-9-]+\.(?:com|ai|io|co|org|net|app|so|us))\b/);
  push(embedded?.[1]);

  const cleaned = name
    .toLowerCase()
    .replace(/^(?:sq|tst|sqsp|pp|paypal|venmo|sp|pos|chk|ach|web|id|visa|mc)\s*\*\s*/, "")
    .replace(/#\s*\d+/g, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned
    .split(" ")
    .filter((w) => w && !GUESS_SKIP.has(w) && !/^\d+$/.test(w) && w.length > 1 && !w.includes("."));
  // Prefer the two-word compound (capitalone.com) before the head token alone.
  if (words.length >= 2) push(guessDomain(words[0] + words[1]));
  if (words.length >= 1) push(guessDomain(words[0]));
  return out;
}

export function merchantLogoUrl(name: string | null | undefined) {
  const domain = merchantDomains(name)[0];
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
  else if (kind === "security" && opts.symbol) {
    const logo = securityLogoUrl(opts.symbol);
    if (logo) out.push(logo);
  }
  else if (kind === "institution") {
    const u = institutionLogoUrl(opts.name);
    if (u) out.push(u);
  } else if (kind === "merchant") {
    for (const domain of merchantDomains(opts.name)) out.push(faviconUrl(domain));
  }
  return out;
}
