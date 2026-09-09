"use client";

import { useMemo, useState } from "react";
import { Money, Delta } from "./money";
import { BrandLabel } from "./brand-mark";
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

type WindowKey = "day" | "week" | "month";

export function NetWorthHero({
  netWorth,
  assets,
  liabilities,
  dayChange,
  weekChange,
  monthChange,
  movers,
}: {
  netWorth: number;
  assets: number;
  liabilities: number;
  dayChange: number | null;
  weekChange: number | null;
  monthChange: number | null;
  movers: AssetMover[];
}) {
  const [win, setWin] = useState<WindowKey>("day");
  const top = useMemo(() => {
    return [...movers]
      .map((m) => ({ ...m, move: m[win] }))
      .filter((m) => m.move.delta != null && Math.abs(m.move.delta) >= 1)
      .sort((a, b) => Math.abs(b.move.delta!) - Math.abs(a.move.delta!))
      .slice(0, 5);
  }, [movers, win]);

  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-card px-5 py-6 shadow-[inset_0_1px_0_rgba(232,220,198,0.08),0_22px_50px_-30px_rgba(0,0,0,0.9)] md:px-8 md:py-7">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(203,184,146,0.16),transparent_68%)]" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-72 rounded-full bg-[radial-gradient(circle,rgba(183,208,232,0.1),transparent_70%)]" />
      <div className="relative grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent">
            Household net worth
          </div>
          <div className="mt-3 text-4xl font-medium tracking-tight text-foreground md:text-5xl">
            <Money value={netWorth} />
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            Assets <Money value={assets} className="text-sm text-foreground/80" /> − Liabilities{" "}
            <Money value={liabilities} className="text-sm text-foreground/80" />
          </div>
        </div>
        <div className="lg:col-span-2 rounded-lg border border-border/80 bg-black/15 px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Largest moves
            </div>
            <div className="flex rounded-md border border-border bg-background/40 p-0.5">
              {(["day", "week", "month"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setWin(k)}
                  className={cn(
                    "cursor-pointer rounded px-2 py-0.5 text-[11px] uppercase tracking-wide",
                    win === k ? "bg-secondary text-accent" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
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
        </div>
      </div>
      <div className="relative mt-6 flex flex-wrap gap-x-8 gap-y-1 border-t border-border/80 pt-4 text-sm">
        <span>
          Day <Delta value={dayChange} />
        </span>
        <span>
          Week <Delta value={weekChange} />
        </span>
        <span>
          Month <Delta value={monthChange} />
        </span>
      </div>
    </section>
  );
}
