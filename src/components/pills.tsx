import type { CSSProperties, ReactNode } from "react";
import { InfoTip } from "./info-tip";

/** `compact` packs the pills two-up inside another card (see HeroCard aside). */
export function Pills({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return <div className={compact ? "pills pills-compact" : "pills"}>{children}</div>;
}

export function Pill({
  kicker,
  accent,
  children,
  info,
}: {
  kicker: string;
  accent: string;
  children: ReactNode;
  /** What the figure is made of, behind a "?" beside the label (Cash lists its accounts). */
  info?: ReactNode;
}) {
  return (
    <div className="pill" style={{ "--pill-accent": accent } as CSSProperties}>
      <span className="pill-accent" />
      {info ? (
        // The "?" sits inside the label's line, so this pill stays the height of its neighbours.
        <div className="pill-label">
          <div className="kicker">{kicker}</div>
          <InfoTip label={`What makes up ${kicker.toLowerCase()}`}>{info}</InfoTip>
        </div>
      ) : (
        <div className="kicker">{kicker}</div>
      )}
      <div className="display-number">{children}</div>
    </div>
  );
}
