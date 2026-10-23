import { BrandMark } from "@/components/brand-mark";
import { Money } from "@/components/money";
import { OwnerTag } from "@/components/type";
import { withoutInstitution } from "@/lib/account-label";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/insights";

/**
 * The figures behind a measure, as label and amount rows; total rows sit under a rule. An account row shows its bank's
 * logo, its own name, and its holder faded beside it, as the Overview's Cash list does.
 */
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
          key={r.account?.id ?? r.label}
          className={cn(
            "flex justify-between gap-3",
            r.account ? "items-center" : "items-baseline",
            r.total ? "font-medium text-foreground" : "text-muted-foreground",
            ((i === firstTotal && i > 0) || r.rule) && "mt-1.5 border-t border-border pt-1.5",
          )}
        >
          {r.account ? (
            <dt className="flex min-w-0 items-center gap-1.5" title={r.account.name}>
              <BrandMark kind="institution" name={r.account.institution ?? r.account.name} size={14} />
              <span className="flex min-w-0 items-baseline">
                {/* The logo already names the bank. */}
                <span className="truncate">{withoutInstitution(r.account.name, r.account.institution)}</span>
                <OwnerTag>{r.account.holder}</OwnerTag>
              </span>
            </dt>
          ) : (
            <dt className="min-w-0 truncate">{r.label}</dt>
          )}
          <dd>
            <Money value={r.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
  if (!collapsible) return list;
  return (
    <details className="insight-details mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        <span className="insight-details-show">Show breakdown</span>
        <span className="insight-details-hide">Hide breakdown</span>
      </summary>
      {list}
    </details>
  );
}
