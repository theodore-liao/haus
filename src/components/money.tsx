"use client";

import { createContext, useContext, type ReactNode } from "react";
import { formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const WholeDollars = createContext(false);

/** Headline figures inside this tree render as whole dollars, rounded up. */
export function WholeDollarsScope({ children }: { children: ReactNode }) {
  return <WholeDollars.Provider value={true}>{children}</WholeDollars.Provider>;
}

export function HeroMetric({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="kicker">{label}</div>
      <div className="display-number">
        <WholeDollarsScope>{children}</WholeDollarsScope>
      </div>
    </div>
  );
}

export function Money({
  value,
  signed,
  className,
}: {
  value: number | null | undefined;
  signed?: boolean;
  className?: string;
}) {
  const whole = useContext(WholeDollars);
  const n = value ?? null;
  const tone =
    n == null || !signed
      ? ""
      : n > 0
        ? "text-positive"
        : n < 0
          ? "text-negative"
          : "";
  return <span className={cn("num", tone, className)}>{formatMoney(n, { signed, whole })}</span>;
}

export function Delta({
  value,
  pct,
  className,
}: {
  value: number | null | undefined;
  pct?: number | null;
  className?: string;
}) {
  if (value == null) return <span className={cn("num text-muted-foreground", className)}>—</span>;
  return (
    <span
      className={cn(
        "num",
        value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-muted-foreground",
        className,
      )}
    >
      {formatMoney(value, { signed: true })}
      {pct != null ? ` (${formatPct(pct)})` : ""}
    </span>
  );
}
