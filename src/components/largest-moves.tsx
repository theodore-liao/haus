"use client";

import { useMemo, useState } from "react";
import { BrandLabel } from "@/components/brand-mark";
import { Delta } from "@/components/money";
import { cn } from "@/lib/utils";
import { kickerClass } from "@/components/type";
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

type Ranked = AssetMover & { move: AssetMover["day"] };

export function LargestMoves({ movers }: { movers: AssetMover[] }) {
  const [win, setWin] = useState<"day" | "week" | "month">("day");
  const { gainers, losers, empty } = useMemo(() => {
    const ranked: Ranked[] = movers
      .map((m) => ({ ...m, move: m[win] }))
      .filter((m) => m.move.delta != null);
    const gainers = ranked
      .filter((m) => (m.move.delta ?? 0) > 0)
      .sort((a, b) => b.move.delta! - a.move.delta!)
      .slice(0, 7);
    const losers = ranked
      .filter((m) => (m.move.delta ?? 0) < 0)
      .sort((a, b) => a.move.delta! - b.move.delta!)
      .slice(0, 7);
    return { gainers, losers, empty: gainers.length === 0 && losers.length === 0 };
  }, [movers, win]);

  return (
    <section className="chart-card">
      <div className="kicker">
        <span>Largest moves</span>
        <div className="flex rounded-md border border-border p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => setWin(w.key)}
              className={cn(
                "cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em]",
                win === w.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">No quoted moves for this window yet.</p>
      ) : (
        <div className="grid w-full gap-6 sm:grid-cols-2">
          <MoveCol title="Gainers" rows={gainers} />
          <MoveCol title="Losers" rows={losers} />
        </div>
      )}
    </section>
  );
}

function MoveCol({ title, rows }: { title: string; rows: Ranked[] }) {
  return (
    <div className="min-w-0">
      <div className={cn(kickerClass, "mb-2")}>
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">None this window.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3">
              <BrandLabel className="min-w-0" kind={m.kind} symbol={m.symbol} name={m.name}>
                <span className="truncate text-sm">{m.symbol ?? m.name}</span>
              </BrandLabel>
              <Delta value={m.move.delta} pct={m.move.pct} className="shrink-0 text-sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
