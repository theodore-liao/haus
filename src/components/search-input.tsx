"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The one search box for tables: top left of its header, same size everywhere, trims on blur. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <Input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onChange(value.trim())}
      className={cn("h-8 w-72 max-w-full shrink-0 text-sm", className)}
    />
  );
}
