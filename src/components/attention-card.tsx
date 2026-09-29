"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { ChartCard } from "./chart-card";
import { Money } from "./money";
import { colorFor } from "@/lib/category-colors";
import { budgetStatus } from "@/lib/budget-window";
import { summarizeBudget, type BudgetOutlookRow } from "@/lib/attention";
import { cn } from "@/lib/utils";

export type RelinkNotice = { key: string; name: string };

const CHIP = {
  "on-track": { label: "On track", tone: "good" },
  "over-pace": { label: "Over pace", tone: "warn" },
  over: { label: "Over budget", tone: "bad" },
} as const;

/** Overview's budget card: is the month on track, and how each budgeted category is doing. */
export function BudgetCard({
  rows,
  dismissed,
  daysLeft,
  elapsed,
  notices,
}: {
  rows: BudgetOutlookRow[];
  dismissed: string[];
  daysLeft: number;
  /** Share of the month gone, through today. */
  elapsed: number;
  notices: RelinkNotice[];
}) {
  const [hidden, setHidden] = useState(dismissed);
  const shown = useMemo(() => rows.filter((r) => !hidden.includes(r.category)), [rows, hidden]);
  const sum = useMemo(() => summarizeBudget(shown), [shown]);
  const chip = CHIP[sum.status];

  async function dismiss(category: string) {
    const previous = hidden;
    setHidden([...hidden, category]);
    const res = await fetch("/api/budget-dismissed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: category }),
    }).catch(() => null);
    if (!res?.ok) setHidden(previous);
  }

  return (
    <ChartCard
      kicker="Budget"
      className="lg:absolute lg:inset-0 lg:h-auto max-lg:max-h-[30rem]"
      actions={
        rows.length > 0 ? (
          <span className="normal-case tracking-normal text-muted-foreground">
            {daysLeft} {daysLeft === 1 ? "day" : "days"} left
          </span>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No budgets set yet.{" "}
          <Link href="/spending#budget" className="text-foreground underline underline-offset-2">
            Set a monthly budget
          </Link>{" "}
          to see whether the month is on track.
        </p>
      ) : (
        <>
          {shown.length > 0 ? (
            <div className="mb-3">
              <span className="status-chip" data-tone={chip.tone}>
                {chip.label}
              </span>
              <p className="footnote mt-1.5">
                Spent <Money value={sum.spent} /> of <Money value={sum.budget} /> · on pace for about{" "}
                <Money value={sum.projected} /> by month end
              </p>
            </div>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">Every budget is dismissed until next month.</p>
          )}
          {notices.map((n) => (
            <div key={n.key} className="footnote mb-2 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{n.name} needs to be relinked.</span>
              <Link href="/connections" className="shrink-0 text-foreground underline underline-offset-2">
                Relink
              </Link>
            </div>
          ))}
          <ul className="soft-scroll min-h-0 flex-1 space-y-3 pr-1">
            {shown.map((r) => {
              const status = budgetStatus(r.spent, r.budget, elapsed);
              const over = status === "over";
              const left = Math.abs(r.budget - r.spent);
              const width = r.budget > 0 ? Math.min(100, (r.spent / r.budget) * 100) : r.spent > 0 ? 100 : 0;
              const color = over ? "var(--negative)" : status === "ahead" ? "var(--accent)" : colorFor(r.category);
              return (
                <li key={r.category}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="size-2 shrink-0 rounded-sm" style={{ background: colorFor(r.category) }} />
                    <span className="min-w-0 flex-1 truncate text-sm">{r.category}</span>
                    <span
                      className={cn(
                        "num text-xs",
                        over ? "text-negative" : status === "ahead" ? "text-accent" : "text-muted-foreground",
                      )}
                    >
                      <Money value={left} /> {over ? "over" : "left"}
                    </span>
                    <button
                      type="button"
                      className="cursor-pointer text-muted-foreground hover:text-foreground"
                      aria-label={`Dismiss ${r.category} until next month`}
                      title="Dismiss until next month"
                      onClick={() => void dismiss(r.category)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="relative mt-1 ml-4 h-1 rounded-full bg-secondary">
                    <div className="h-full overflow-hidden rounded-full">
                      <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
                    </div>
                    <span
                      aria-hidden
                      className="absolute -top-0.5 h-2 w-px bg-foreground/70"
                      style={{ left: `${Math.min(100, elapsed * 100)}%` }}
                    />
                  </div>
                  <div className="footnote mt-1 pl-4">
                    <Money value={r.spent} /> of <Money value={r.budget} />
                    {status === "ahead" ? " · ahead of pace" : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </ChartCard>
  );
}
