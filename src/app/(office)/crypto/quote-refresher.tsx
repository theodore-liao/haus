"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** After the page shows stored prices, fetch fresh ones and redraw only if something changed. */
export function CryptoQuoteRefresher({
  missing,
  history = [],
}: {
  missing: string[];
  /** Coins whose last 45 daily closes should be stored (summary line, 1W and 1M moves). */
  history?: { symbol: string; coingeckoId: string | null; spot?: number | null }[];
}) {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void fetch("/api/crypto-quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: missing, history }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { changed?: boolean } | null) => {
        if (data?.changed) router.refresh();
      })
      .catch(() => {});
  }, [missing, history, router]);
  return null;
}
