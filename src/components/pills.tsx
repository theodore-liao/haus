import type { CSSProperties, ReactNode } from "react";

/** `compact` packs the pills two-up inside another card (see HeroCard aside). */
export function Pills({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return <div className={compact ? "pills pills-compact" : "pills"}>{children}</div>;
}

export function Pill({
  kicker,
  accent,
  children,
}: {
  kicker: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div className="pill" style={{ "--pill-accent": accent } as CSSProperties}>
      <span className="pill-accent" />
      <div className="kicker">{kicker}</div>
      <div className="display-number">{children}</div>
    </div>
  );
}
