"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { colorFor } from "@/lib/category-colors";
import { Money } from "@/components/money";
import { ChartCard } from "@/components/chart-card";
import { budgetStatus, type BudgetRow } from "@/lib/budget-window";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function BudgetList({
  rows,
  choices,
  spent,
  months,
  daysLeft,
  elapsed,
}: {
  rows: BudgetRow[];
  /** Every category that can be added, with the 3-month average as its starting monthly amount. */
  choices: BudgetRow[];
  spent: Record<string, number>;
  months: number;
  daysLeft: number | null;
  /** Share of the open month gone. Null unless the chip is the current month. */
  elapsed: number | null;
}) {
  const [list, setList] = useState(rows);
  const remaining = useMemo(
    () => choices.filter((c) => !list.some((row) => row.category === c.category)),
    [choices, list],
  );

  async function save(category: string, monthly: number, previous: BudgetRow[]) {
    const res = await fetch("/api/budgets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, monthly }),
    });
    if (!res.ok) setList(previous);
  }

  async function add(category: string) {
    const choice = remaining.find((c) => c.category === category);
    if (!choice) return;
    const previous = list;
    setList([...list, choice]);
    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(choice),
    });
    if (!res.ok) setList(previous);
  }

  async function remove(category: string) {
    const previous = list;
    setList(list.filter((row) => row.category !== category));
    const res = await fetch("/api/budgets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (!res.ok) setList(previous);
  }

  return (
    <ChartCard
      kicker="Budget"
      actions={
        daysLeft != null ? (
          <span className="normal-case tracking-normal text-muted-foreground">
            {daysLeft} {daysLeft === 1 ? "day" : "days"} to go
          </span>
        ) : null
      }
    >
      <p className="footnote mb-3">
        {months === 1
          ? "Each figure is that category’s monthly budget."
          : `Each figure is the monthly budget × ${months} for this window.`}
        {elapsed != null ? ` The tick marks how much of the month has gone (${Math.round(elapsed * 100)}%).` : null}
      </p>
      <ul className="min-h-0 flex-1 space-y-3 overflow-x-clip overflow-y-auto pr-1">
        {list.map((row) => (
          <BudgetRowView
            key={row.category}
            row={row}
            spent={spent[row.category] ?? 0}
            months={months}
            elapsed={elapsed}
            onCommit={(monthly) => {
              const previous = list;
              setList(list.map((item) => (item.category === row.category ? { ...item, monthly } : item)));
              void save(row.category, monthly, previous);
            }}
            onRemove={() => void remove(row.category)}
          />
        ))}
      </ul>
      {remaining.length > 0 ? (
        <Select
          value=""
          onValueChange={(category) => {
            if (category) void add(category);
          }}
        >
          <SelectTrigger className="mt-4 w-full" aria-label="Add a category">
            <SelectValue placeholder="Add a category" />
          </SelectTrigger>
          <SelectContent>
            {remaining.map((c) => (
              <SelectItem key={c.category} value={c.category}>
                {c.category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </ChartCard>
  );
}

function BudgetRowView({
  row,
  spent,
  months,
  elapsed,
  onCommit,
  onRemove,
}: {
  row: BudgetRow;
  spent: number;
  months: number;
  elapsed: number | null;
  onCommit: (monthly: number) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.monthly));
  const [prev, setPrev] = useState(row.monthly);
  if (prev !== row.monthly) {
    setPrev(row.monthly);
    setDraft(String(row.monthly));
  }
  const target = row.monthly * months;
  const status = budgetStatus(spent, target, elapsed);
  const over = status === "over";
  const barColor = over ? "var(--negative)" : status === "ahead" ? "var(--accent)" : colorFor(row.category);
  const left = Math.abs(target - spent);
  const pct = target > 0 ? Math.round((spent / target) * 100) : null;
  const width = target > 0 ? Math.min(100, (spent / target) * 100) : spent > 0 ? 100 : 0;

  function commit() {
    const n = Number(draft.replace(/[^0-9.]/g, ""));
    const monthly = Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : row.monthly;
    setDraft(String(monthly));
    setEditing(false);
    if (monthly !== row.monthly) onCommit(monthly);
  }

  return (
    <li>
      <div className="flex min-w-0 items-center gap-2">
        <span className="size-2 shrink-0 rounded-sm" style={{ background: colorFor(row.category) }} />
        <span className="min-w-0 flex-1 truncate text-sm">{row.category}</span>
        {editing ? (
          <>
            <label className="sr-only" htmlFor={`budget-${row.category}`}>
              Monthly budget for {row.category}
            </label>
            <span className="text-xs text-muted-foreground">$</span>
            <input
              id={`budget-${row.category}`}
              inputMode="decimal"
              className="num money h-8 w-20 rounded-md border border-border bg-card px-2 text-right text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Escape") {
                  setDraft(String(row.monthly));
                  setEditing(false);
                }
              }}
            />
            <span className="text-xs text-muted-foreground">/mo</span>
            <Button type="button" size="sm" onClick={commit}>
              Save
            </Button>
          </>
        ) : (
          <>
            <Money value={target} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(String(row.monthly));
                setEditing(true);
              }}
            >
              Edit
            </Button>
          </>
        )}
        <button
          type="button"
          className="cursor-pointer text-muted-foreground hover:text-foreground"
          aria-label={`Remove ${row.category}`}
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        className={cn(
          "mt-1 pl-4 text-xs",
          over ? "text-negative" : status === "ahead" ? "text-accent" : "text-muted-foreground",
        )}
      >
        <span className="num">
          {pct != null ? `${pct}% · ` : null}
          {over ? (
            <>
              <Money value={left} /> over
            </>
          ) : (
            <>
              <Money value={left} /> to go
            </>
          )}
          {status === "ahead" ? " · ahead of pace" : null}
        </span>
      </div>
      <div className="relative mt-1 ml-4 h-1 rounded-full bg-secondary">
        <div className="h-full overflow-hidden rounded-full">
          <div className="h-full rounded-full" style={{ width: `${width}%`, background: barColor }} />
        </div>
        {elapsed != null ? (
          <span
            aria-hidden
            className="absolute -top-0.5 h-2 w-px bg-foreground/70"
            style={{ left: `${Math.min(100, elapsed * 100)}%` }}
          />
        ) : null}
      </div>
    </li>
  );
}
