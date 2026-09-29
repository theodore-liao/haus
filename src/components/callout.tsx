import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** What to do next: green when on track, gold when behind, red when it cannot work, grey for plain information. */
export function Callout({
  tone,
  children,
  className,
}: {
  tone: "good" | "warn" | "bad" | "info";
  children: ReactNode;
  className?: string;
}) {
  const Icon = tone === "good" ? CircleCheck : tone === "info" ? Info : CircleAlert;
  return (
    <div className={cn("callout", className)} data-tone={tone === "warn" ? undefined : tone}>
      <Icon aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
