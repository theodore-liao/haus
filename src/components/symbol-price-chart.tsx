"use client";

import { useEffect, useState } from "react";
import { NetWorthChart } from "@/components/charts";

/**
 * Draws the stored closes immediately, then asks for up to five years and swaps the line in when they arrive.
 * A coin's list refresh only keeps about 45 days, so 6M, 1Y, and All would otherwise be the same short line.
 */
export function SymbolPriceChart({
  symbol,
  kind,
  coingeckoId,
  spot,
  prices,
}: {
  symbol: string;
  kind: "crypto" | "equity";
  coingeckoId: string | null;
  spot: number | null;
  prices: { date: string; close: number }[];
}) {
  const [rows, setRows] = useState(prices);
  const [forSymbol, setForSymbol] = useState(symbol);
  if (forSymbol !== symbol) {
    setForSymbol(symbol);
    setRows(prices);
  }

  useEffect(() => {
    let cancel = false;
    fetch("/api/price-history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol, kind, coingeckoId, spot }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { prices?: { date: string; close: number }[] } | null) => {
        if (!cancel && data?.prices?.length) setRows(data.prices);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [symbol, kind, coingeckoId, spot]);

  return (
    <NetWorthChart
      data={rows.map((p) => ({ date: p.date, netWorth: p.close }))}
      name="Close"
      zeroBased={false}
      empty="No stored price history for this symbol yet."
    />
  );
}
