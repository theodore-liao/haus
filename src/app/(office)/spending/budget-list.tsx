"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { NumberField } from "@/components/number-field";
import { Button } from "@/components/ui/button";
import { colorFor } from "@/lib/category-colors";
import { BudgetLabel } from "@/components/open-category";
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
  onOpen,
}: {
  rows: BudgetRow[];
  /** Every category that can be added, with the 3-month average as its starting monthly amount. */
  choices: BudgetRow[];
  spent: Record<string, number>;
  months: number;
  daysLeft: number | null;
  /** Share of the open month gone. Null unless the chip is the current month. */
  elapsed: number | null;
  /** Opens that category's merchant window, as a donut slice does. */
  onOpen: (category: string) => void;
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
    if (!res.ok) {
      setList(previous);
      toast.error("Couldn’t save that budget.");
    }
  }

  async function post(choice: BudgetRow) {
    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(choice),
    }).catch(() => null);
    return Boolean(res?.ok);
  }

  async function add(category: string) {
    const choice = remaining.find((c) => c.category === category);
    if (!choice) return;
    const previous = list;
    setList([...list, choice]);
    if (!(await post(choice))) {
      setList(previous);
      toast.error("Couldn’t add that budget.");
    }
  }

  async function remove(row: BudgetRow) {
    const previous = list;
    setList(list.filter((item) => item.category !== row.category));
    const res = await fetch("/api/budgets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: row.category }),
    }).catch(() => null);
    if (!res?.ok) {
      setList(previous);
      toast.error(`Couldn’t remove ${row.category}.`);
      return;
    }
    toast(`Removed ${row.category}`, {
      action: {
        label: "Undo",
        onClick: () => {
          setList((cur) => (cur.some((item) => item.category === row.category) ? cur : [...cur, row]));
          void post(row).then((ok) => {
            if (ok) return;
            setList((cur) => cur.filter((item) => item.category !== row.category));
            toast.error(`Couldn’t restore ${row.category}.`);
          });
        },
      },
    });
  }

  return (
    <ChartCard
      id="budget"
      className="breakdown-budget"
      kicker="Budget"
      actions={
        daysLeft != null ? (
          <span className="normal-case tracking-normal text-muted-foreground">
            {daysLeft} {daysLeft === 1 ? "day" : "days"} left
          </span>
        ) : null
      }
    >
      <p className="footnote mb-3">
        {months === 1
          ? "Each figure is that category’s monthly budget."
          : Number.isInteger(months)
            ? `Each figure is the monthly budget × ${months} for this window.`
            : // A custom window: say it in days, since 38 days is not a tidy number of months.
              `Each figure is the monthly budget scaled to ${Math.round(months * (365.25 / 12))} ${Math.round(months * (365.25 / 12)) === 1 ? "day" : "days"} (about ${months.toFixed(2)} months).`}
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
            onOpen={onOpen}
            onCommit={(monthly) => {
              const previous = list;
              setList(list.map((item) => (item.category === row.category ? { ...item, monthly } : item)));
              void save(row.category, monthly, previous);
            }}
            onRemove={() => void remove(row)}
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
  onOpen,
  onCommit,
  onRemove,
}: {
  row: BudgetRow;
  spent: number;
  months: number;
  elapsed: number | null;
  onOpen: (category: string) => void;
  onCommit: (monthly: number) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const target = row.monthly * months;
  const status = budgetStatus(spent, target, elapsed);
  const over = status === "over";
  const barColor = over ? "var(--negative)" : status === "ahead" ? "var(--accent)" : colorFor(row.category);
  const left = Math.abs(target - spent);
  const pct = target > 0 ? Math.round((spent / target) * 100) : null;
  const width = target > 0 ? Math.min(100, (spent / target) * 100) : spent > 0 ? 100 : 0;

  return (
    <li>
      <div className="flex min-w-0 items-center gap-2">
        <BudgetLabel category={row.category} onOpen={onOpen} />
        {editing ? (
          <>
            {/* The box applies on Enter or leaving it; Save closes the editor once the typed amount has gone in. */}
            <NumberField
              className="w-36 shrink-0"
              ariaLabel={`Monthly budget for ${row.category}`}
              value={row.monthly}
              onValue={(v) => {
                if (v != null && v !== row.monthly) onCommit(v);
                setEditing(false);
              }}
              prefix="$"
              suffix="/mo"
              money
              min={0}
              max={1000000}
            />
            <Button type="button" size="sm" onClick={() => setEditing(false)}>
              Save
            </Button>
          </>
        ) : (
          <>
            <Money value={target} />
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
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
          {pct != null ? (
            <>
              {pct}% of <Money value={target} /> ·{" "}
            </>
          ) : null}
          <Money value={left} /> {over ? "over" : "left"}
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
