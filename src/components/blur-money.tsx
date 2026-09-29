import type { ReactNode } from "react";

const MONEY_TOKEN = /([+\-−]?\$\d[\d,]*(?:\.\d+)?)/g;

/** Blur only the dollar amounts inside a sentence that also has counts, dates, or percents. */
export function withBlurredMoney(text: string): ReactNode {
  const parts = text.split(MONEY_TOKEN);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="money">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
