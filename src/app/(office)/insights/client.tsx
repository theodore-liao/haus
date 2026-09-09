"use client";

import { cn } from "@/lib/utils";

const SECTION_ORDER = ["Liquidity", "Portfolio", "Insurance", "Activity"];

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
