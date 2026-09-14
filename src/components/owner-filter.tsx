"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { givenName, type OwnerFilter } from "@/lib/owners";

export function OwnerFilterBar({
  value,
  nameA,
  nameB,
}: {
  value: OwnerFilter;
  nameA: string;
  nameB: string;
}) {
  const router = useRouter();
  const options: { value: OwnerFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "a", label: givenName(nameA) || nameA },
    { value: "b", label: givenName(nameB) || nameB },
    { value: "children", label: "Children" },
  ];

  function setFilter(v: OwnerFilter) {
    document.cookie = `haus_owner=${v}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className="inline-flex rounded-md border border-border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setFilter(o.value)}
          className={cn(
            "rounded-sm px-2.5 py-1 text-[12px] tracking-wide transition-colors",
            value === o.value ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
