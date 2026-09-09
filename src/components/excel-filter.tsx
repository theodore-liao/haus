"use client";

import { useMemo, useState } from "react";
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
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return options.filter((o) => !needle || o.toLowerCase().includes(needle));
  }, [options, q]);
  const active = selected != null && selected.size !== options.length;
  const allOn = draft == null || (options.length > 0 && draft.size === options.length);
  const someOn = draft != null && draft.size > 0 && draft.size < options.length;

  function openPanel(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240) });
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
        className="fixed z-[80] w-56 rounded-md border border-border bg-card-elevated p-2 shadow-lg"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          className="h-7 cursor-text text-xs"
          placeholder={`Search ${label.toLowerCase()}`}
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
        onClick={openPanel}
        aria-label={`Filter ${label}`}
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
