import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onClick, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
        type === "date" && "cursor-pointer",
        className,
      )}
      ref={ref}
      onClick={(e) => {
        if (type === "date") {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* unsupported */
          }
        }
        onClick?.(e);
      }}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
