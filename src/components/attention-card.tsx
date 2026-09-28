import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Money } from "./money";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AttentionItem } from "@/lib/attention";

type Row = { tone: "negative" | "warning"; title: string; detail: React.ReactNode; href: string; action: string };

function describe(item: AttentionItem): Row {
  switch (item.kind) {
    case "relink":
      return {
        tone: "negative",
        title: `${item.name} needs to be relinked`,
        detail: item.message ?? "Sign in again to resume syncing.",
        href: "/connections",
        action: "Relink",
      };
    case "stale":
      return {
        tone: "warning",
        title: `${item.name} has not synced lately`,
        detail: `Last sync ${formatDateTime(item.lastSyncedAt)}.`,
        href: "/connections",
        action: "Check",
      };
    case "wallet":
      return {
        tone: "warning",
        title: `${item.name} could not sync`,
        detail: "Its balance may be out of date.",
        href: "/crypto",
        action: "Open",
      };
    case "utilization":
      return {
        tone: "warning",
        title: `${item.name} is at ${Math.round(item.pct * 100)}% of its limit`,
        detail: (
          <>
            <Money value={item.balance} /> of <Money value={item.limit} />. Above 30% can lower a credit score.
          </>
        ),
        href: "/transactions",
        action: "Review",
      };
    case "budget":
      return {
        tone: "negative",
        title: `${item.category} is over budget`,
        detail: (
          <>
            <Money value={item.spent} /> of <Money value={item.budget} /> this month.
          </>
        ),
        href: "/spending",
        action: "Open",
      };
    case "charge":
      return {
        tone: "warning",
        title: item.usual == null ? `Large first charge from ${item.merchant}` : `Unusual charge from ${item.merchant}`,
        detail:
          item.usual == null ? (
            <>
              <Money value={item.amount} /> on {formatDate(item.date)}.
            </>
          ) : (
            <>
              <Money value={item.amount} /> on {formatDate(item.date)}. Usually <Money value={item.usual} />.
            </>
          ),
        href: `/transactions?q=${encodeURIComponent(item.merchant)}`,
        action: "Review",
      };
    case "renewal":
      return {
        tone: "warning",
        title: `${item.label} renews ${item.days === 0 ? "today" : `in ${item.days} ${item.days === 1 ? "day" : "days"}`}`,
        detail: `Renews ${formatDate(item.date)}.`,
        href: "/insurance",
        action: "Open",
      };
  }
}

/** Overview's to-do list. Says so plainly when there is nothing to do. */
export function AttentionCard({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 pt-[var(--space-card)] text-sm text-muted-foreground">
          <CircleCheck className="h-4 w-4 shrink-0 text-positive" />
          Nothing needs attention.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader row>
        <div className="flex items-baseline gap-2">
          <CardTitle>Needs attention</CardTitle>
          <span className="footnote num">{items.length}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const row = describe(item);
            return (
              <li key={item.key} className="flex min-w-0 items-center gap-3 py-2.5">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    row.tone === "negative" ? "bg-negative" : "bg-accent",
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{row.title}</div>
                  <div className="footnote truncate">{row.detail}</div>
                </div>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href={row.href}>{row.action}</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
