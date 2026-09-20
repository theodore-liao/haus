// CoinGecko is the only source that knows every wrapped / staked / long-tail token we hold.
// One /coins/markets call covers up to 250 ids, and the map is kept in memory for a week.

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { url: string | null; at: number }>();
let inflight: Promise<void> | null = null;

async function fetchMissing(ids: string[]) {
  for (let i = 0; i < ids.length; i += 250) {
    const chunk = ids.slice(i, i + 250);
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&ids=${encodeURIComponent(chunk.join(","))}`;
    try {
      const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const rows = (await res.json()) as { id: string; image?: string }[];
      const now = Date.now();
      const seen = new Set<string>();
      for (const r of rows) {
        seen.add(r.id);
        cache.set(r.id, { url: r.image ? r.image.replace("/large/", "/small/") : null, at: now });
      }
      // Remember misses too, so an unknown id doesn't trigger a fetch on every page view.
      for (const id of chunk) if (!seen.has(id)) cache.set(id, { url: null, at: now });
    } catch {
      /* offline: fall back to symbol-based sources on the client */
    }
  }
}

/** Resolve CoinGecko ids to logo URLs. Never throws; missing ids simply aren't in the result. */
export async function getCryptoLogoMap(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const now = Date.now();
  const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const missing = wanted.filter((id) => {
    const hit = cache.get(id);
    return !hit || now - hit.at > TTL_MS;
  });
  if (missing.length) {
    if (!inflight) inflight = fetchMissing(missing).finally(() => (inflight = null));
    await inflight;
  }
  const out = new Map<string, string>();
  for (const id of wanted) {
    const url = cache.get(id)?.url;
    if (url) out.set(id, url);
  }
  return out;
}
