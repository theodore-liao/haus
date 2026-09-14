"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLabel } from "@/components/brand-mark";
import { Delta } from "@/components/money";
import { cn } from "@/lib/utils";
export type AssetMover = {
  id: string;
  symbol: string | null;
  name: string;
  kind: "crypto" | "security";
  value: number;
  day: { delta: number | null; pct: number | null };
  week: { delta: number | null; pct: number | null };
  month: { delta: number | null; pct: number | null };
};

const WINDOWS = [
  { key: "day", label: "1D" },
  { key: "week", label: "1w" },
  { key: "month", label: "1m" },
] as const;

export function LargestMoves({ movers }: { movers: AssetMover[] }) {
  const [win, setWin] = useState<"day" | "week" | "month">("day");
  const top = useMemo(() => {
    return [...movers]
      .map((m) => ({ ...m, move: m[win] }))
      .filter((m) => m.move.delta != null && Math.abs(m.move.delta) >= 1)
      .sort((a, b) => Math.abs(b.move.delta!) - Math.abs(a.move.delta!))
      .slice(0, 6);
  }, [movers, win]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Largest moves</CardTitle>
        <div className="flex rounded-md border border-border p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => setWin(w.key)}
              className={cn(
                "cursor-pointer rounded px-2 py-0.5 text-[11px] uppercase tracking-wide",
                win === w.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">No quoted moves for this window yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {top.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3">
                <BrandLabel className="min-w-0" kind={m.kind} symbol={m.symbol} name={m.name}>
                  <span className="truncate text-sm">{m.symbol ?? m.name}</span>
                </BrandLabel>
                <Delta value={m.move.delta} pct={m.move.pct} className="shrink-0 text-sm" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
