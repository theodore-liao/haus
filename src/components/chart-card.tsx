import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CardIcon } from "./card-icon";

export function ChartCard({
  kicker,
  actions,
  children,
  className,
  id,
}: {
  kicker: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("chart-card", id && "scroll-mt-6", className)}>
      <div className="kicker card-title">
        <span className="inline-flex items-center">
          <CardIcon title={kicker} />
          {kicker}
        </span>
        {actions}
      </div>
      {children}
    </section>
  );
}
