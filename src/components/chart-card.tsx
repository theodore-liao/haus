import type { ReactNode } from "react";

export function ChartCard({
  kicker,
  actions,
  children,
}: {
  kicker: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="chart-card">
      <div className="kicker">
        <span>{kicker}</span>
        {actions}
      </div>
      {children}
    </section>
  );
}
