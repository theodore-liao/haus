import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "positive" | "negative" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium tracking-wide",
        tone === "neutral" && "bg-secondary text-muted-foreground",
        tone === "positive" && "bg-positive/10 text-positive",
        tone === "negative" && "bg-negative/10 text-negative",
        tone === "accent" && "bg-primary/10 text-primary",
        className,
      )}
      {...props}
    />
  );
}
