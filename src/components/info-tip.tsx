"use client";

import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** A "?" beside a label that opens a longer explanation, so the page itself only carries the short version. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground" aria-label={label}>
          <CircleHelp className="!size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-[min(26rem,var(--radix-popover-content-available-width))] prose-num leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}
