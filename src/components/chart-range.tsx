"use client";

import type { ReactNode } from "react";
import { RANGE_KEYS, calendarMonthOptions, type RangeKey, type WindowKey } from "@/lib/range";
import { cn } from "@/lib/utils";

function ChipGroup({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">{children}</div>;
}

function Chip({
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
        "cursor-pointer rounded px-2 py-0.5 text-[11px] uppercase tracking-wide",
        active ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground",
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

/** Rolling windows plus the last three calendar months. */
export function ReportRange({
  value,
  onChange,
}: {
  value: WindowKey;
  onChange: (key: WindowKey) => void;
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
      </ChipGroup>
    </div>
  );
}
