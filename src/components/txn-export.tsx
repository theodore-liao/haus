"use client";

import { useState } from "react";
import { addMonths, format, getDay, getDaysInMonth, isSameDay, isWithinInterval, startOfDay, startOfMonth, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function dayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function TxnExport() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);

  const from = start ? startOfDay(start) : null;
  const to = end ? startOfDay(end) : from;
  const rangeStart = from && to && to < from ? to : from;
  const rangeEnd = from && to && to < from ? from : to;

  function pick(day: Date) {
    const next = startOfDay(day);
    if (!start || end) {
      setStart(next);
      setEnd(null);
      return;
    }
    if (next < startOfDay(start)) {
      setEnd(start);
      setStart(next);
      return;
    }
    setEnd(next);
  }

  function download() {
    if (!rangeStart || !rangeEnd) return;
    const fromKey = dayKey(rangeStart);
    const toKey = dayKey(rangeEnd);
    const a = document.createElement("a");
    a.href = `/api/export/transactions?from=${fromKey}&to=${toKey}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setOpen(false);
  }

  const lead = getDay(startOfMonth(month));
  const days = getDaysInMonth(month);
  const label =
    rangeStart && rangeEnd
      ? isSameDay(rangeStart, rangeEnd)
        ? format(rangeStart, "d MMM yyyy")
        : `${format(rangeStart, "d MMM yyyy")} – ${format(rangeEnd, "d MMM yyyy")}`
      : "Select a start and end date";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="mt-0.5 shrink-0">
          Download
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[17.5rem] p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Previous month"
            onClick={() => setMonth((m) => subMonths(m, 1))}
          >
            ‹
          </button>
          <div className="text-sm">{format(month, "MMM yyyy")}</div>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Next month"
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground">
          {WEEKDAYS.map((d, i) => (
            <div key={`${d}-${i}`} className="py-1">
              {d}
            </div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day = new Date(month.getFullYear(), month.getMonth(), i + 1);
            const selected =
              rangeStart && rangeEnd
                ? isWithinInterval(day, { start: rangeStart, end: rangeEnd })
                : false;
            const edge = (rangeStart && isSameDay(day, rangeStart)) || (rangeEnd && isSameDay(day, rangeEnd));
            return (
              <button
                key={dayKey(day)}
                type="button"
                aria-label={dayKey(day)}
                onClick={() => pick(day)}
                className={cn(
                  "h-8 rounded text-sm text-foreground hover:bg-secondary",
                  selected && "bg-secondary",
                  edge && "bg-foreground text-background hover:bg-foreground",
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-muted-foreground">{label}</p>
          <Button type="button" size="sm" className="h-7 shrink-0" disabled={!rangeStart} onClick={download}>
            Download
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
