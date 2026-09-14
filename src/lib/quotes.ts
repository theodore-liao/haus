import { prisma } from "./db";
import { finnhubKey } from "./env";
import { startOfDay } from "./format";
import { COINGECKO_IDS } from "./crypto-assets";
import { FIXED_USD_ID } from "./constants";
import { fetchDexScreenerPrices, fetchJupiterPrices, fetchSpotUsd } from "./token-prices";

type Quote = { price: number; change: number; changePct: number; asOf: Date };

const quoteCache = new Map<string, { quote: Quote; at: number }>();
const TTL_MS = 15 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchYahooQuote(symbol: string): Promise<(Quote & { name?: string }) | null> {
  const cached = quoteCache.get(`eq:${symbol}`);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.quote;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json", "user-agent": "Haus/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    chart?: {
      result?: {
        meta?: { regularMarketPrice?: number; chartPreviousClose?: number; shortName?: string; symbol?: string };
      }[];
    };
  };
  const meta = data.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice ?? 0);
  if (!(price > 0)) return null;
  const prev = Number(meta?.chartPreviousClose ?? 0);
  const change = prev > 0 ? price - prev : 0;
  const changePct = prev > 0 ? (change / prev) * 100 : 0;
  const quote: Quote = { price, change, changePct, asOf: new Date() };
  quoteCache.set(`eq:${symbol}`, { quote, at: Date.now() });
  return { ...quote, name: meta?.shortName };
}

export async function fetchEquitySpot(symbol: string): Promise<(Quote & { name?: string }) | null> {
  const household = await prisma.household.findUnique({ where: { id: "haus" } });
  const token = finnhubKey(household?.quoteApiKey);
  if (token) {
    const q = await fetchFinnhubQuote(symbol, token);
    if (q) return q;
  }
  return fetchYahooQuote(symbol);
}

async function fetchFinnhubQuote(symbol: string, token: string): Promise<Quote | null> {
  const cached = quoteCache.get(`eq:${symbol}`);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.quote;
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { c?: number; d?: number; dp?: number; t?: number };
  if (!data.c || data.c <= 0) return null;
  const quote: Quote = {
    price: data.c,
    change: data.d ?? 0,
    changePct: data.dp ?? 0,
    asOf: data.t ? new Date(data.t * 1000) : new Date(),
  };
  quoteCache.set(`eq:${symbol}`, { quote, at: Date.now() });
  return quote;
}

async function fetchGeckoQuotes(ids: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  if (!ids.length) return out;
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(chunk.join(","))}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) continue;
    const data = (await res.json()) as Record<string, { usd?: number; usd_24hr_change?: number }>;
    const asOf = new Date();
    for (const [id, row] of Object.entries(data)) {
      if (!row.usd || row.usd <= 0) continue;
      const changePct = row.usd_24hr_change ?? 0;
      out.set(id, {
        price: row.usd,
        change: row.usd * (changePct / 100),
        changePct,
        asOf,
      });
    }
    if (i + 40 < unique.length) await sleep(250);
  }
  return out;
}

export async function enrichHoldingsQuotes() {
  const household = await prisma.household.findUnique({ where: { id: "haus" } });
  const token = finnhubKey(household?.quoteApiKey);

  const holdings = await prisma.holding.findMany({
    where: { symbol: { not: null } },
    select: { id: true, symbol: true },
  });
  const symbols = [
    ...new Set(
      holdings
        .map((h) => h.symbol?.trim().toUpperCase())
        .filter((s): s is string => typeof s === "string" && /^[A-Z0-9.\-]{1,8}$/.test(s)),
    ),
  ];

  let enriched = 0;
  if (token) {
    for (const symbol of symbols) {
      try {
        const quote = await fetchFinnhubQuote(symbol, token);
        if (!quote) continue;
        await prisma.holding.updateMany({
          where: { symbol },
          data: {
            quotePrice: quote.price,
            quoteChange: quote.change,
            quoteChangePct: quote.changePct,
            quoteAsOf: quote.asOf,
          },
        });
        enriched += 1;
      } catch {
        /* keep last good quote */
      }
      await sleep(180);
    }
  }

  const manuals = await prisma.manualHolding.findMany({
    where: { kind: "security", NOT: { coingeckoId: FIXED_USD_ID } },
    select: { id: true, symbol: true },
  });
  for (const row of manuals) {
    const symbol = row.symbol.trim().toUpperCase();
    if (!/^[A-Z0-9.\-]{1,8}$/.test(symbol)) continue;
    try {
      const quote = await fetchEquitySpot(symbol);
      if (!quote) continue;
      await prisma.manualHolding.update({
        where: { id: row.id },
        data: {
          quotePrice: quote.price,
          quoteChange: quote.change,
          quoteChangePct: quote.changePct,
          quoteAsOf: quote.asOf,
          name: quote.name || undefined,
        },
      });
      enriched += 1;
    } catch {
      /* keep last good quote */
    }
  }

  const cryptoEnriched = await enrichCryptoQuotes();
  return { enriched: enriched + cryptoEnriched, skipped: !token && cryptoEnriched === 0 };
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
};

async function fetchGeckoTokenPrices(platform: string, contracts: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const unique = [...new Set(contracts.map((c) => c.toLowerCase()))];
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const url = `https://api.coingecko.com/api/v3/simple/token_price/${encodeURIComponent(platform)}?contract_addresses=${encodeURIComponent(chunk.join(","))}&vs_currencies=usd&include_24hr_change=true`;
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as Record<string, { usd?: number; usd_24hr_change?: number }>;
      const asOf = new Date();
      for (const [addr, row] of Object.entries(data)) {
        if (!row.usd || row.usd <= 0) continue;
        const changePct = row.usd_24hr_change ?? 0;
        out.set(addr.toLowerCase(), {
          price: row.usd,
          change: row.usd * (changePct / 100),
          changePct,
          asOf,
        });
      }
    } catch {
      /* skip chunk */
    }
    if (i + 30 < unique.length) await sleep(250);
  }
  return out;
}

export async function enrichCryptoQuotes() {
  const rows = await prisma.manualHolding.findMany({ where: { kind: "crypto" } });
  const assets = await prisma.cryptoWalletAsset.findMany();
  const ids = [
    ...rows.map((r) => r.coingeckoId),
    ...assets.map((a) => a.coingeckoId ?? COINGECKO_IDS[a.symbol.toUpperCase()]?.id ?? null),
  ].filter((id): id is string => Boolean(id));
  const quotes = await fetchGeckoQuotes(ids);
  let n = 0;
  for (const row of rows) {
    let q = row.coingeckoId ? quotes.get(row.coingeckoId) : undefined;
    if (!q) {
      const spot = await fetchSpotUsd(row.symbol, row.coingeckoId);
      if (spot) {
        q = {
          price: spot.price,
          change: spot.price * ((spot.changePct ?? 0) / 100),
          changePct: spot.changePct ?? 0,
          asOf: new Date(),
        };
      }
    }
    if (!q) continue;
    await prisma.manualHolding.update({
      where: { id: row.id },
      data: {
        quotePrice: q.price,
        quoteChange: q.change,
        quoteChangePct: q.changePct,
        quoteAsOf: q.asOf,
      },
    });
    n += 1;
  }

  const priced = new Map<string, Quote>();
  for (const a of assets) {
    const gecko = a.coingeckoId ?? COINGECKO_IDS[a.symbol.toUpperCase()]?.id ?? null;
    if (gecko && quotes.get(gecko)) priced.set(a.id, quotes.get(gecko)!);
  }
  const needContract = assets.filter((a) => !priced.has(a.id) && a.contractAddress);
  const byPlatform = new Map<string, string[]>();
  for (const a of needContract) {
    const platform = GECKO_PLATFORM[a.chain];
    if (!platform || !a.contractAddress) continue;
    const list = byPlatform.get(platform) ?? [];
    list.push(a.contractAddress);
    byPlatform.set(platform, list);
  }
  const contractQuotes = new Map<string, Quote>();
  for (const [platform, contracts] of byPlatform) {
    const map = await fetchGeckoTokenPrices(platform, contracts);
    for (const [addr, q] of map) contractQuotes.set(`${platform}:${addr}`, q);
  }
  const still = assets.filter((a) => !priced.has(a.id) && a.contractAddress);
  const solMints = still.filter((a) => a.chain === "solana").map((a) => a.contractAddress!);
  const jup = solMints.length ? await fetchJupiterPrices(solMints) : new Map();
  const dexNeed = new Map<string, string[]>();
  for (const a of still) {
    if (a.chain === "solana" && jup.has(a.contractAddress!)) continue;
    const list = dexNeed.get(a.chain) ?? [];
    list.push(a.contractAddress!);
    dexNeed.set(a.chain, list);
  }
  const dex = new Map<string, { price: number; changePct?: number }>();
  for (const [chain, addrs] of dexNeed) {
    const map = await fetchDexScreenerPrices(chain, addrs);
    for (const [addr, q] of map) dex.set(`${chain}:${chain === "solana" ? addr : addr.toLowerCase()}`, q);
  }

  for (const a of assets) {
    let q = priced.get(a.id) ?? null;
    if (!q && a.contractAddress) {
      const platform = GECKO_PLATFORM[a.chain];
      if (platform) q = contractQuotes.get(`${platform}:${a.contractAddress.toLowerCase()}`) ?? null;
    }
    if (!q && a.contractAddress && a.chain === "solana") {
      const j = jup.get(a.contractAddress);
      if (j) q = { price: j.price, change: j.price * ((j.changePct ?? 0) / 100), changePct: j.changePct ?? 0, asOf: new Date() };
    }
    if (!q && a.contractAddress) {
      const key = `${a.chain}:${a.chain === "solana" ? a.contractAddress : a.contractAddress.toLowerCase()}`;
      const d = dex.get(key);
      if (d) q = { price: d.price, change: d.price * ((d.changePct ?? 0) / 100), changePct: d.changePct ?? 0, asOf: new Date() };
    }
    if (!q) continue;
    await prisma.cryptoWalletAsset.update({
      where: { id: a.id },
      data: {
        quotePrice: q.price,
        quoteChange: q.change,
        quoteChangePct: q.changePct,
        quoteAsOf: q.asOf,
        coingeckoId: a.coingeckoId ?? COINGECKO_IDS[a.symbol.toUpperCase()]?.id ?? a.coingeckoId,
        symbol: a.symbol,
        name: a.name,
      },
    });
    n += 1;
  }
  return n;
}

function dayKey(d: Date) {
  const x = startOfDay(d);
  return x.toISOString();
}

export type HistorySymbol = {
  symbol: string;
  coingeckoId?: string | null;
  spot?: number | null;
  kind?: "crypto" | "equity";
};

async function writeCloses(symbol: string, rows: { date: Date; close: number }[], source: string) {
  let n = 0;
  for (const row of rows) {
    if (!row.close || row.close <= 0) continue;
    const date = startOfDay(row.date);
    await prisma.pricePoint.upsert({
      where: { symbol_date: { symbol, date } },
      create: { symbol, date, close: row.close, source },
      update: { close: row.close, source },
    });
    n += 1;
  }
  return n;
}

function latestClose(rows: { date: Date; close: number }[]) {
  let best: { date: Date; close: number } | null = null;
  for (const row of rows) {
    if (!row.close || row.close <= 0) continue;
    if (!best || row.date.getTime() > best.date.getTime()) best = row;
  }
  return best?.close ?? null;
}

/** Latest bar should sit near the live quote. Far off means a colliding ticker, not a real move. */
export function historyAgreesWithSpot(close: number | null | undefined, spot: number | null | undefined) {
  if (close == null || close <= 0 || spot == null || spot <= 0) return true;
  const ratio = close / spot;
  return ratio >= 0.67 && ratio <= 1.5;
}

function seriesMatchesSpot(rows: { date: Date; close: number }[], spot: number | null | undefined) {
  return historyAgreesWithSpot(latestClose(rows), spot);
}

async function coverageRows(symbol: string, from: Date, to: Date) {
  return prisma.pricePoint.findMany({
    where: { symbol, date: { gte: from, lte: to } },
    select: { date: true, close: true },
    orderBy: { date: "asc" },
  });
}

function neededCloses(from: Date, to: Date) {
  const spanDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1);
  // Equities skip weekends; 45% of calendar days is enough to hit 7d/30d lookbacks.
  return Math.max(4, Math.floor(spanDays * 0.45));
}

function resolveKind(item: HistorySymbol): "crypto" | "equity" {
  if (item.kind) return item.kind;
  if (item.coingeckoId || COINGECKO_IDS[item.symbol]) return "crypto";
  return "equity";
}

export async function ensurePriceHistory(symbols: HistorySymbol[], from: Date, to: Date) {
  const fromDay = startOfDay(from);
  const toDay = startOfDay(to);
  const household = await prisma.household.findUnique({ where: { id: "haus" } });
  const token = finnhubKey(household?.quoteApiKey);
  const need = neededCloses(fromDay, toDay);

  const unique = new Map<string, HistorySymbol>();
  for (const item of symbols) {
    const symbol = item.symbol.trim().toUpperCase();
    if (!symbol || symbol.includes(":") || symbol.length > 12) continue;
    const next: HistorySymbol = {
      symbol,
      coingeckoId: item.coingeckoId || COINGECKO_IDS[symbol]?.id || null,
      spot: item.spot,
      kind: item.kind,
    };
    const prev = unique.get(symbol);
    if (prev) {
      if (!prev.coingeckoId && next.coingeckoId) prev.coingeckoId = next.coingeckoId;
      if (prev.spot == null && next.spot != null) prev.spot = next.spot;
      if (next.kind === "crypto") prev.kind = "crypto";
      continue;
    }
    unique.set(symbol, next);
  }
  const list = [...unique.values()];
  for (let i = 0; i < list.length; i += 3) {
    const batch = list.slice(i, i + 3);
    await Promise.all(
      batch.map(async (item) => {
        const existing = await coverageRows(item.symbol, fromDay, toDay);
        if (existing.length >= need && seriesMatchesSpot(existing, item.spot)) return;
        if (existing.length && !seriesMatchesSpot(existing, item.spot)) {
          await prisma.pricePoint.deleteMany({ where: { symbol: item.symbol } });
        }
        const kind = resolveKind(item);
        const tryWrite = async (rows: { date: Date; close: number }[], source: string) => {
          if (!rows.length || !seriesMatchesSpot(rows, item.spot)) return 0;
          return writeCloses(item.symbol, rows, source);
        };
        if (kind === "crypto") {
          if (item.coingeckoId) {
            const rows = await fetchGeckoHistoryRows(item.coingeckoId, fromDay, toDay);
            if (await tryWrite(rows, "coingecko")) return;
          }
          const cb = await fetchCoinbaseHistoryRows(item.symbol, fromDay, toDay);
          await tryWrite(cb, "coinbase");
          return;
        }
        if (token) {
          const fh = await fetchFinnhubHistoryRows(item.symbol, token, fromDay, toDay);
          if (await tryWrite(fh, "finnhub")) return;
        }
        const yh = await fetchYahooHistoryRows(item.symbol, fromDay, toDay);
        await tryWrite(yh, "yahoo");
      }),
    );
    if (i + 3 < list.length) await sleep(150);
  }
}

async function fetchGeckoHistoryRows(id: string, from: Date, to: Date) {
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000));
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${Math.min(days, 730)}&interval=daily`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { prices?: [number, number][] };
    return (data.prices ?? [])
      .filter(([, price]) => price > 0)
      .map(([ts, price]) => ({ date: new Date(ts), close: price }));
  } catch {
    return [];
  }
}

async function fetchFinnhubHistoryRows(symbol: string, token: string, from: Date, to: Date) {
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${Math.floor(from.getTime() / 1000)}&to=${Math.floor(to.getTime() / 1000)}&token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { s?: string; t?: number[]; c?: number[] };
    if (data.s !== "ok" || !data.t || !data.c) return [];
    const rows: { date: Date; close: number }[] = [];
    for (let i = 0; i < data.t.length; i++) {
      if (!data.c[i] || data.c[i] <= 0) continue;
      rows.push({ date: new Date(data.t[i] * 1000), close: data.c[i] });
    }
    return rows;
  } catch {
    return [];
  }
}

async function fetchCoinbaseHistoryRows(symbol: string, from: Date, to: Date) {
  const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}-USD/candles?granularity=86400&start=${from.toISOString()}&end=${to.toISOString()}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as [number, number, number, number, number, number][] | { message?: string };
    if (!Array.isArray(data)) return [];
    return data
      .filter((row) => row[4] > 0)
      .map((row) => ({ date: new Date(row[0] * 1000), close: row[4] }));
  } catch {
    return [];
  }
}

async function fetchYahooHistoryRows(symbol: string, from: Date, to: Date) {
  // Do not try SYMBOL-USD — Yahoo maps that to unrelated crypto (USDG-USD is DGTEK, not Global Dollar).
  const tickers = [...new Set([symbol, symbol.replace(/\./g, "-")])];
  for (const ticker of tickers) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${Math.floor(from.getTime() / 1000)}&period2=${Math.floor(to.getTime() / 1000)}&interval=1d`;
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { accept: "application/json", "user-agent": "Haus/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        chart?: {
          result?: {
            meta?: { instrumentType?: string; shortName?: string };
            timestamp?: number[];
            indicators?: { quote?: { close?: (number | null)[] }[] };
          }[];
        };
      };
      const result = data.chart?.result?.[0];
      if ((result?.meta?.instrumentType || "").toUpperCase() === "CRYPTOCURRENCY") continue;
      const ts = result?.timestamp;
      const close = result?.indicators?.quote?.[0]?.close;
      if (!ts?.length || !close?.length) continue;
      const rows: { date: Date; close: number }[] = [];
      for (let i = 0; i < ts.length; i++) {
        const px = close[i];
        if (px == null || px <= 0) continue;
        rows.push({ date: new Date(ts[i] * 1000), close: px });
      }
      if (rows.length) return rows;
    } catch {
      /* try next ticker */
    }
  }
  return [];
}

export async function loadPriceMap(symbols: string[], from: Date, to: Date) {
  const rows = await prisma.pricePoint.findMany({
    where: { symbol: { in: symbols }, date: { gte: startOfDay(from), lte: startOfDay(to) } },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(`${r.symbol}|${dayKey(r.date)}`, r.close);
  }
  return map;
}

export function priceOnOrBefore(map: Map<string, number>, symbol: string, date: Date, lookbackDays = 10) {
  const day = startOfDay(date);
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(day);
    d.setDate(d.getDate() - i);
    const v = map.get(`${symbol}|${dayKey(d)}`);
    if (v != null) return v;
  }
  return null;
}
