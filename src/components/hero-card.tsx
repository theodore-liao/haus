import type { ReactNode } from "react";
import { Delta, WholeDollarsScope } from "./money";

export function HeroCard({
  kicker,
  children,
  supporting,
  deltas,
  aside,
}: {
  kicker: string;
  children: ReactNode;
  supporting?: ReactNode;
  deltas?: { label: string; value: number | null }[];
  /** Right-hand column (e.g. compact pills). The figure and its deltas stay on the left. */
  aside?: ReactNode;
}) {
  const deltaRow =
    deltas && deltas.length > 0 ? (
      <div className="delta-row">
        {deltas.map((d) => (
          <span key={d.label}>
            {d.label} <Delta value={d.value} />
          </span>
        ))}
      </div>
    ) : null;

  if (aside) {
    return (
      <section className="hero-card hero-card-split">
        <div className="min-w-0">
          <div className="kicker">{kicker}</div>
          <div className="display-number">
            <WholeDollarsScope>{children}</WholeDollarsScope>
          </div>
          {supporting ? <div className="supporting-line">{supporting}</div> : null}
          {deltaRow}
        </div>
        <div className="min-w-0">{aside}</div>
      </section>
    );
  }

  return (
    <section className="hero-card">
      <div className="kicker">{kicker}</div>
      <div className="display-number">
        <WholeDollarsScope>{children}</WholeDollarsScope>
      </div>
      {supporting ? <div className="supporting-line">{supporting}</div> : null}
      {deltaRow ? (
        <>
          <div className="rule" />
          {deltaRow}
        </>
      ) : null}
    </section>
  );
}
