import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ChartCard({
  kicker,
  actions,
  children,
  className,
}: {
  kicker: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("chart-card", className)}>
      <div className="kicker">
        <span>{kicker}</span>
        {actions}
      </div>
      {children}
    </section>
  );
}
