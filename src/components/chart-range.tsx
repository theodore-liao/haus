"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_RANGE,
  RANGE_KEYS,
  asLocalDate,
  calendarMonthOptions,
  customBounds,
  customKey,
  isCustomKey,
  ymKey,
  type RangeKey,
  type WindowKey,
} from "@/lib/range";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { storedDefaultRange } from "@/lib/prefs";
import { cn } from "@/lib/utils";

/** Range state seeded from the Settings preference after mount (server renders the app default). */
export function useChartRange(): [RangeKey, (key: RangeKey) => void] {
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  useEffect(() => {
    const stored = storedDefaultRange();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setRange(stored);
  }, []);
  return [range, setRange];
}

/** Date chips open on the month the server already chose from Settings. */
export function useReportWindow(initial: WindowKey): [WindowKey, (key: WindowKey) => void] {
  const [range, setRange] = useState<WindowKey>(initial);
  return [range, setRange];
}

export function ChipGroup({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="flex max-w-full flex-wrap items-center gap-0.5 rounded-md border border-border bg-background/40 p-0.5">{children}</div>;
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em]",
        active ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_rgba(183,208,232,0.22)]" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function ChartRange({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
}) {
  return (
    <ChipGroup>
      {RANGE_KEYS.map((key) => (
        <Chip key={key} active={value === key} onClick={() => onChange(key)}>
          {key}
        </Chip>
      ))}
    </ChipGroup>
  );
}

/** Rolling windows plus the last three calendar months, and, where `custom` is on, a window of two picked days. */
export function ReportRange({
  value,
  onChange,
  custom,
}: {
  value: WindowKey | null;
  onChange: (key: WindowKey) => void;
  custom?: boolean;
}) {
  const months = calendarMonthOptions(3);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ChipGroup>
        {months.map((m) => (
          <Chip key={m.key} active={value === m.key} onClick={() => onChange(m.key)}>
            {m.label}
          </Chip>
        ))}
      </ChipGroup>
      <ChipGroup>
        {RANGE_KEYS.map((key) => (
          <Chip key={key} active={value === key} onClick={() => onChange(key)}>
            {key}
          </Chip>
        ))}
        {custom ? <CustomRange value={value} onChange={onChange} /> : null}
      </ChipGroup>
    </div>
  );
}

const shortDay = (day: string, year = false) =>
  asLocalDate(day).toLocaleString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });

/** "Sep 9" for one day, "Aug 3 – Sep 9" this year, with years once the window reaches into another year. */
function windowLabel(from: string, to: string, today: string) {
  const years = from.slice(0, 4) !== to.slice(0, 4) || to.slice(0, 4) !== today.slice(0, 4);
  if (from === to) return shortDay(from, years);
  return `${shortDay(from, years)} – ${shortDay(to, years)}`;
}

/** The Custom chip: shows the picked days once chosen, and opens From and To boxes that apply together. */
function CustomRange({ value, onChange }: { value: WindowKey | null; onChange: (key: WindowKey) => void }) {
  const active = value != null && isCustomKey(value);
  const now = new Date();
  const today = `${ymKey(now)}-${String(now.getDate()).padStart(2, "0")}`;
  const current = active ? customBounds(value) : null;
  const monthAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  const [open, setOpen] = useState(false);
  // Opens on the last 30 days, so the common case is one click.
  const [from, setFrom] = useState(current?.from ?? `${ymKey(monthAgo)}-${String(monthAgo.getDate()).padStart(2, "0")}`);
  const [to, setTo] = useState(current?.to ?? today);
  const filled = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
  const problem = !filled
    ? "Pick both days."
    : to < from
      ? "To must be on or after From."
      : from > today || to > today
        ? "Pick days up to today."
        : null;
  const ready = problem == null;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && current) {
          setFrom(current.from);
          setTo(current.to);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em]",
            active ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_rgba(183,208,232,0.22)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {current ? windowLabel(current.from, current.to, today) : "Custom"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            onChange(customKey(from, to));
            setOpen(false);
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              From
              <Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              To
              <Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          {filled && problem ? (
            <p className="field-note" data-error="">
              {problem}
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={!ready}>
            Show these days
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
