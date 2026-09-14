"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { BrandMark } from "./brand-mark";
import type { BrandKind } from "@/lib/logos";

export type AmountRule = {
  op: "any" | "eq" | "gt" | "gte" | "lt" | "lte" | "between";
  a: string;
  b: string;
};

export function emptyAmountRule(): AmountRule {
  return { op: "any", a: "", b: "" };
}

export function amountPasses(value: number, rule: AmountRule) {
  if (rule.op === "any") return true;
  const a = Number(rule.a);
  const b = Number(rule.b);
  if (rule.op !== "between" && Number.isNaN(a)) return true;
  if (rule.op === "eq") return value === a;
  if (rule.op === "gt") return value > a;
  if (rule.op === "gte") return value >= a;
  if (rule.op === "lt") return value < a;
  if (rule.op === "lte") return value <= a;
  if (rule.op === "between") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (Number.isNaN(a)) return value <= b;
    if (Number.isNaN(b)) return value >= a;
    return value >= Math.min(a, b) && value <= Math.max(a, b);
  }
  return true;
}

type Pos = { top: number; left: number };

export function DiscreteFilter({
  label,
  options,
  selected,
  onChange,
  kind,
}: {
  label: string;
  options: string[];
  selected: Set<string> | null;
  onChange: (next: Set<string> | null) => void;
  kind?: BrandKind;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0 });
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const long = options.length > 12;
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return options.filter((o) => !needle || o.toLowerCase().includes(needle));
  }, [options, q]);
  const active = selected != null && selected.size !== options.length;
  const allOn = draft == null || (options.length > 0 && draft.size === options.length);
  const someOn = draft != null && draft.size > 0 && draft.size < options.length;

  function place() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240) });
  }

  function close(apply: boolean) {
    if (apply) onChange(draft);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    place();
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close(true);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, draft]);

  function openPanel(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    setDraft(selected == null ? null : new Set(selected));
    setQ("");
    setOpen(true);
  }

  function toggle(value: string) {
    const base = draft ?? new Set(options);
    const next = new Set(base);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setDraft(next.size === options.length ? null : next);
  }

  const panel =
    open &&
    createPortal(
      <div
        ref={panelRef}
        className="fixed z-[80] w-56 rounded-md border border-border bg-card-elevated p-2 shadow-lg"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          className="h-7 cursor-text text-xs"
          placeholder={long ? `Filter ${label.toLowerCase()}` : `Search ${label.toLowerCase()}`}
          autoFocus={long}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
          <label className="flex cursor-pointer items-center gap-2 border-b border-border py-1 font-medium">
            <input
              type="checkbox"
              className="cursor-pointer"
              checked={allOn}
              ref={(el) => {
                if (el) el.indeterminate = someOn;
              }}
              onChange={() => setDraft(allOn ? new Set() : null)}
            />
            <span>(Select All)</span>
          </label>
          {visible.map((o) => {
            const checked = draft == null || draft.has(o);
            return (
              <label key={o} className="flex cursor-pointer items-center gap-2 py-0.5">
                <input type="checkbox" className="cursor-pointer" checked={checked} onChange={() => toggle(o)} />
                {kind ? <BrandMark kind={kind} name={o} symbol={o} size={14} /> : null}
                <span className="truncate">{o || "(blank)"}</span>
              </label>
            );
          })}
        </div>
      </div>,
      document.body,
    );

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        className={cn(
          "ml-1 cursor-pointer text-muted-foreground hover:text-foreground",
          active && "text-primary",
        )}
        onClick={openPanel}
        aria-label={`Filter ${label}`}
      >
        <Filter className="h-3 w-3" />
      </button>
      {panel}
    </span>
  );
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function dateMonthKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type YearGroup = { year: number; months: { key: string; label: string }[] };

function yearGroupsFromDates(dates: string[]): YearGroup[] {
  const map = new Map<number, Set<number>>();
  for (const iso of dates) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getFullYear();
    const m = d.getMonth();
    let set = map.get(y);
    if (!set) {
      set = new Set();
      map.set(y, set);
    }
    set.add(m);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: [...months]
        .sort((a, b) => b - a)
        .map((m) => ({
          key: `${year}-${String(m + 1).padStart(2, "0")}`,
          label: MONTHS[m],
        })),
    }));
}

export function DateFilter({
  dates,
  selected,
  onChange,
}: {
  dates: string[];
  selected: Set<string> | null;
  onChange: (next: Set<string> | null) => void;
}) {
  const groups = useMemo(() => yearGroupsFromDates(dates), [dates]);
  const allKeys = useMemo(() => groups.flatMap((g) => g.months.map((m) => m.key)), [groups]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0 });
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const active = selected != null && selected.size !== allKeys.length;
  const allOn = draft == null || (allKeys.length > 0 && draft.size === allKeys.length);
  const someOn = draft != null && draft.size > 0 && draft.size < allKeys.length;

  function yearState(g: YearGroup): "all" | "some" | "none" {
    if (draft == null) return "all";
    const n = g.months.filter((m) => draft.has(m.key)).length;
    if (n === 0) return "none";
    if (n === g.months.length) return "all";
    return "some";
  }

  function commit(next: Set<string>) {
    setDraft(next.size === allKeys.length ? null : next);
  }

  function toggleMonth(key: string) {
    const base = draft ?? new Set(allKeys);
    const next = new Set(base);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    commit(next);
  }

  function toggleYear(g: YearGroup) {
    const base = draft ?? new Set(allKeys);
    const next = new Set(base);
    const st = yearState(g);
    if (st === "all") g.months.forEach((m) => next.delete(m.key));
    else g.months.forEach((m) => next.add(m.key));
    commit(next);
  }

  const panel =
    open &&
    createPortal(
      <div
        className="fixed z-[80] w-56 rounded-md border border-border bg-card-elevated p-2 shadow-lg"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-64 space-y-0.5 overflow-y-auto text-xs">
          <label className="flex cursor-pointer items-center gap-2 border-b border-border py-1 font-medium">
            <input
              type="checkbox"
              className="cursor-pointer"
              checked={allOn}
              ref={(el) => {
                if (el) el.indeterminate = someOn;
              }}
              onChange={() => setDraft(allOn ? new Set() : null)}
            />
            <span>(Select All)</span>
          </label>
          {groups.map((g) => {
            const st = yearState(g);
            return (
              <div key={g.year}>
                <label className="flex cursor-pointer items-center gap-2 py-0.5 font-medium">
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    checked={st === "all"}
                    ref={(el) => {
                      if (el) el.indeterminate = st === "some";
                    }}
                    onChange={() => toggleYear(g)}
                  />
                  <span>{g.year}</span>
                </label>
                {g.months.map((m) => (
                  <label key={m.key} className="flex cursor-pointer items-center gap-2 py-0.5 pl-5">
                    <input
                      type="checkbox"
                      className="cursor-pointer"
                      checked={draft == null || draft.has(m.key)}
                      onChange={() => toggleMonth(m.key)}
                    />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-end gap-1 border-t border-border pt-2">
          <Button type="button" size="sm" variant="ghost" className="cursor-pointer" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="cursor-pointer"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            Ok
          </Button>
        </div>
      </div>,
      document.body,
    );

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className={cn(
          "ml-1 cursor-pointer text-muted-foreground hover:text-foreground",
          active && "text-primary",
        )}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240) });
          setDraft(selected == null ? null : new Set(selected));
          setOpen(true);
        }}
        aria-label="Filter date"
      >
        <Filter className="h-3 w-3" />
      </button>
      {panel}
    </span>
  );
}

export function AmountFilter({
  rule,
  onChange,
}: {
  rule: AmountRule;
  onChange: (rule: AmountRule) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0 });
  const [draft, setDraft] = useState<AmountRule>(rule);
  const active = rule.op !== "any";

  const panel =
    open &&
    createPortal(
      <div
        className="fixed z-[80] w-64 space-y-2 rounded-md border border-border bg-card-elevated p-3 shadow-lg"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <select
          className="flex h-8 w-full cursor-pointer rounded-md border border-border bg-card px-2 text-xs"
          value={draft.op}
          onChange={(e) => setDraft({ ...draft, op: e.target.value as AmountRule["op"] })}
        >
          <option value="any">Any</option>
          <option value="eq">Equals</option>
          <option value="gt">Greater than</option>
          <option value="gte">Greater than or equal</option>
          <option value="lt">Less than</option>
          <option value="lte">Less than or equal</option>
          <option value="between">Between</option>
        </select>
        {draft.op !== "any" && (
          <Input
            className="h-8 text-xs"
            type="number"
            placeholder="$"
            value={draft.a}
            onChange={(e) => setDraft({ ...draft, a: e.target.value })}
          />
        )}
        {draft.op === "between" && (
          <Input
            className="h-8 text-xs"
            type="number"
            placeholder="and $"
            value={draft.b}
            onChange={(e) => setDraft({ ...draft, b: e.target.value })}
          />
        )}
        <div className="flex justify-end gap-1 pt-1">
          <Button type="button" size="sm" variant="ghost" className="cursor-pointer" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="cursor-pointer"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            Ok
          </Button>
        </div>
      </div>,
      document.body,
    );

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className={cn(
          "ml-1 cursor-pointer text-muted-foreground hover:text-foreground",
          active && "text-primary",
        )}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 256) });
          setDraft(rule);
          setOpen(true);
        }}
        aria-label="Filter amount"
      >
        <Filter className="h-3 w-3" />
      </button>
      {panel}
    </span>
  );
}

export type SortDir = "asc" | "desc" | null;

export function nextSortDir(current: SortDir): SortDir {
  if (current == null) return "asc";
  if (current === "asc") return "desc";
  return null;
}

export function SortMark({ dir }: { dir: SortDir }) {
  if (dir === "asc") return <span className="text-[10px] text-primary">↑</span>;
  if (dir === "desc") return <span className="text-[10px] text-primary">↓</span>;
  return null;
}

export function ResetFilters({
  dirty,
  onReset,
}: {
  dirty: boolean;
  onReset: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="cursor-pointer"
      disabled={!dirty}
      onClick={onReset}
    >
      Reset all filters
    </Button>
  );
}
