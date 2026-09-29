import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/insights";

/** The figures behind a measure, as label and amount rows; total rows sit under a rule. */
export function InsightBreakdown({ rows }: { rows: NonNullable<Insight["breakdown"]> }) {
  if (!rows.length) return null;
  const firstTotal = rows.findIndex((r) => r.total);
  return (
    <dl className="mt-3 space-y-1 text-xs">
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={cn(
            "flex items-baseline justify-between gap-3",
            r.total ? "font-medium text-foreground" : "text-muted-foreground",
            i === firstTotal && i > 0 && "mt-1.5 border-t border-border pt-1.5",
          )}
        >
          <dt className="min-w-0 truncate">{r.label}</dt>
          <dd>
            <Money value={r.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
