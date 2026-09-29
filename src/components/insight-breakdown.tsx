import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/insights";

/** The figures behind a measure, as label and amount rows; total rows sit under a rule. */
export function InsightBreakdown({
  rows,
  collapsible,
}: {
  rows: NonNullable<Insight["breakdown"]>;
  /** Fold the rows behind a "Show breakdown" line, closed until opened. */
  collapsible?: boolean;
}) {
  if (!rows.length) return null;
  const firstTotal = rows.findIndex((r) => r.total);
  const list = (
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
  if (!collapsible) return list;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show breakdown</summary>
      {list}
    </details>
  );
}
