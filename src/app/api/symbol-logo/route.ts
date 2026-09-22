import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { logoTicker } from "@/lib/logos";

export const dynamic = "force-dynamic";

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { body: Uint8Array; type: string; at: number }>();

function placeholder(symbol: string) {
  const initial = (symbol.replace(/[^A-Za-z]/g, "").charAt(0) || "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="8" fill="#e7e5e4"/><text x="32" y="42" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#57534e">${initial}</text></svg>`;
  return new NextResponse(svg, {
    headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=86400" },
  });
}

export async function GET(req: Request) {
  await requireSession();
  const ticker = logoTicker(new URL(req.url).searchParams.get("symbol") ?? "");
  if (!ticker) return placeholder("?");
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return new NextResponse(Buffer.from(hit.body), {
      headers: { "content-type": hit.type, "cache-control": "private, max-age=86400" },
    });
  }
  const upstream = await fetch(`https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}`, {
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!upstream?.ok) return placeholder(ticker);
  const body = new Uint8Array(await upstream.arrayBuffer());
  const type = upstream.headers.get("content-type") || "image/png";
  cache.set(ticker, { body, type, at: Date.now() });
  return new NextResponse(Buffer.from(body), {
    headers: { "content-type": type, "cache-control": "private, max-age=86400" },
  });
}
