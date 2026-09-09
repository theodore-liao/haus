"use client";

import { RANGE_KEYS, type RangeKey } from "@/lib/range";
import { cn } from "@/lib/utils";

export function ChartRange({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {RANGE_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] uppercase tracking-wide",
            value === key ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
