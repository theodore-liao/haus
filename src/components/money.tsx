import { formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Money({
  value,
  signed,
  className,
}: {
  value: number | null | undefined;
  signed?: boolean;
  className?: string;
}) {
  const n = value ?? null;
  const tone =
    n == null || !signed
      ? ""
      : n > 0
        ? "text-positive"
        : n < 0
          ? "text-negative"
          : "";
  return <span className={cn("font-mono tabular-nums", tone, className)}>{formatMoney(n, { signed })}</span>;
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
  if (value == null) return <span className={cn("font-mono tabular-nums text-muted-foreground", className)}>—</span>;
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-muted-foreground",
        className,
      )}
    >
      {formatMoney(value, { signed: true })}
      {pct != null ? ` (${formatPct(pct)})` : ""}
    </span>
  );
}
