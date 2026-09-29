import * as React from "react";
import { cn } from "@/lib/utils";
import { kickerClass } from "@/components/type";
import { CardIcon } from "@/components/card-icon";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "surface rounded-[var(--radius-card)] text-foreground",
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
  const { children, ...rest } = props;
  return (
    <h3 className={cn(kickerClass, "card-title", className)} {...rest}>
      <CardIcon title={children} />
      {children}
    </h3>
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-[var(--space-card)] pt-1 pb-[var(--space-card)]", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardContent };
