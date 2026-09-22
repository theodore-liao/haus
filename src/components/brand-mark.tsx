"use client";

import { useState, type ReactNode } from "react";
import { brandLogoCandidates, type BrandKind } from "@/lib/logos";
import { cn } from "@/lib/utils";

export function BrandMark({
  kind,
  name,
  symbol,
  src,
  size = 16,
  className,
}: {
  kind: BrandKind;
  name?: string | null;
  symbol?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  // Walk the candidate list on error; only after the last one 404s do we show the initial.
  const candidates = brandLogoCandidates(kind, { name, symbol, src });
  const candidateKey = candidates.join("|");
  const [attempt, setAttempt] = useState(0);
  const [forKey, setForKey] = useState(candidateKey);
  if (forKey !== candidateKey) {
    setForKey(candidateKey);
    setAttempt(0);
  }
  const url = candidates[attempt] ?? null;
  const label = (symbol || name || "?").trim();
  const initial = label.charAt(0).toUpperCase();

  if (!url) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-[3px] bg-secondary text-[9px] font-medium text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {initial}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className={cn("inline-block shrink-0 rounded-[3px] bg-white object-contain", className)}
      style={{ width: size, height: size }}
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

export function BrandLabel({
  kind,
  name,
  symbol,
  src,
  children,
  className,
}: {
  kind: BrandKind;
  name?: string | null;
  symbol?: string | null;
  src?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 overflow-hidden", className)}>
      <BrandMark kind={kind} name={name} symbol={symbol} src={src} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
