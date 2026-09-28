"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

/** Opens beside its trigger; clicking outside or pressing Escape closes it. */
export function PopoverContent({
  className,
  sideOffset = 8,
  align = "start",
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={16}
        className={cn(
          "z-50 max-h-[var(--radix-popover-content-available-height)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-border bg-card-elevated p-4 text-sm shadow-[0_18px_40px_-20px_rgba(0,0,0,0.85)] outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
