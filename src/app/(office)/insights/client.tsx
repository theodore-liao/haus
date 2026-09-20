"use client";

import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/type";
import type { InsightCard } from "@/lib/queries";

export function InsightsClient({ cards }: { cards: InsightCard[] }) {
  if (cards.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough history in this filter to form a card.</p>;
  }

  const sections: string[] = [];
  for (const c of cards) if (!sections.includes(c.section)) sections.push(c.section);

  return (
    <>
      {sections.map((section) => (
        <section key={section}>
          <SectionLabel>{section}</SectionLabel>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {cards
              .filter((c) => c.section === section)
              .map((c, i) => (
                <div
                  key={`${c.title}-${i}`}
                  className="flex flex-col rounded-[var(--radius-card)] border border-border bg-card p-[var(--space-card)]"
                >
                  <div className="text-sm font-medium">{c.title}</div>
                  <div
                    className={cn(
                      "display-number mt-2",
                      c.tone === "positive" && "text-positive",
                      c.tone === "negative" && "text-negative",
                    )}
                  >
                    {c.value}
                  </div>
                  <p className="footnote mt-2">{c.math}</p>
                </div>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
