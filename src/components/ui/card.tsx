import * as React from "react";
import { cn } from "@/lib/utils";
import { kickerClass } from "@/components/type";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-card text-foreground shadow-[inset_0_1px_0_rgba(232,220,198,0.07),0_18px_40px_-28px_rgba(0,0,0,0.85)] [background-image:linear-gradient(180deg,rgba(232,220,198,0.045),transparent_42%)]",
        className,
      )}
      {...props}
    />
  );
}

/** `row` puts the title on the left and controls on the right (see .section-head). */
function CardHeader({ className, row, ...props }: React.ComponentProps<"div"> & { row?: boolean }) {
  return (
    <div
      className={cn(
        row ? "section-head" : "flex flex-col gap-1",
        "px-[var(--space-card)] pt-[var(--space-card)] pb-2",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn(kickerClass, className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-[var(--space-card)] pt-1 pb-[var(--space-card)]", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardContent };
