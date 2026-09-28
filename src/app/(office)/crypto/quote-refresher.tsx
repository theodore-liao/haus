"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** After the page shows stored prices, fetch fresh ones and redraw only if something changed. */
export function CryptoQuoteRefresher({ missing }: { missing: string[] }) {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void fetch("/api/crypto-quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: missing }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { changed?: boolean } | null) => {
        if (data?.changed) router.refresh();
      })
      .catch(() => {});
  }, [missing, router]);
  return null;
}
