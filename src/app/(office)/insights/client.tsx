"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/money";

const SECTION_ORDER = ["Questions", "Liquidity", "Portfolio", "Insurance", "Activity"];

type CardRow = {
  section: string;
  title: string;
  math: string;
  value: string;
  tone: "neutral" | "positive" | "negative";
};

export function InsightsClient({ cards }: { cards: CardRow[] }) {
  const grouped = SECTION_ORDER.map((section) => ({
    section,
    items: cards.filter((c) => c.section === section),
  })).filter((g) => g.items.length);

  if (grouped.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough history in this filter to form a card.</p>;
  }

  return (
    <div className="space-y-8">
      <HotelScenario />
      {grouped.map((g) => (
        <section key={g.section}>
          <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {g.section}
          </h2>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {g.items.map((c, i) => (
              <div key={`${c.title}-${i}`} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 sm:pr-6">
                  <div className="text-sm font-medium">{c.title}</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{c.math}</p>
                </div>
                <div
                  className={cn(
                    "shrink-0 font-mono text-xl tabular-nums",
                    c.tone === "positive" && "text-positive",
                    c.tone === "negative" && "text-negative",
                  )}
                >
                  {c.value}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function HotelScenario() {
  const [rate, setRate] = useState(650);
  const [nights, setNights] = useState(20);
  const annual = useMemo(() => rate * nights, [rate, nights]);
  return (
    <section>
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="text-sm font-medium">Baller hotels</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          If you only stayed in high-end rooms, what does a year of nights cost? Compare to travel on Spending.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Nightly rate</Label>
            <Input className="mt-1" type="number" min={0} value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Nights / year</Label>
            <Input className="mt-1" type="number" min={0} value={nights} onChange={(e) => setNights(Number(e.target.value) || 0)} />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Annual</div>
            <div className="mt-2 text-xl font-medium font-mono tabular-nums">
              <Money value={annual} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
