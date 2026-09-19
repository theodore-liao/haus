"use client";

import { Money, Delta } from "./money";

export function NetWorthHero({
  netWorth,
  assets,
  liabilities,
  dayChange,
  weekChange,
  monthChange,
}: {
  netWorth: number;
  assets: number;
  liabilities: number;
  dayChange: number | null;
  weekChange: number | null;
  monthChange: number | null;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-card px-5 py-6 shadow-[inset_0_1px_0_rgba(232,220,198,0.08),0_22px_50px_-30px_rgba(0,0,0,0.9)] md:px-8 md:py-7">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(203,184,146,0.16),transparent_68%)]" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-72 rounded-full bg-[radial-gradient(circle,rgba(183,208,232,0.1),transparent_70%)]" />
      <div className="relative">
        <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-accent">Household net worth</div>
        <div className="mt-3 text-4xl font-medium tracking-tight text-foreground md:text-5xl">
          <Money value={netWorth} />
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          Assets <Money value={assets} className="text-sm text-foreground/80" /> − Liabilities{" "}
          <Money value={liabilities} className="text-sm text-foreground/80" />
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
