"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Callout } from "@/components/callout";
import { InfoTip } from "@/components/info-tip";
import { Money } from "@/components/money";
import { withBlurredMoney } from "@/components/blur-money";
import { InsightBreakdown } from "@/components/insight-breakdown";
import type { Insight, InsightStatus } from "@/lib/insights";


const STATUS: Record<InsightStatus, { label: string; tone: string }> = {
  act: { label: "Act", tone: "bad" },
  watch: { label: "Watch", tone: "warn" },
  good: { label: "On track", tone: "good" },
  info: { label: "For reference", tone: "info" },
};

const PAGE: Record<string, string> = {
  "/": "Overview",
  "/spending": "Spending",
  "/transactions": "Transactions",
  "/investments": "Stocks",
  "/crypto": "Crypto",
  "/retirement": "Retirement",
  "/property": "Property",
  "/insurance": "Insurance",
  "/settings": "Settings",
};

function StatusChip({ status }: { status: InsightStatus }) {
  return (
    <span className="status-chip" data-tone={STATUS[status].tone}>
      {STATUS[status].label}
    </span>
  );
}

export function InsightsClient({
  insights,
  actions,
  payAnnual,
  spendAnnual,
  savingsRate,
}: {
  insights: Insight[];
  actions: Insight[];
  payAnnual: number;
  spendAnnual: number | null;
  savingsRate: number | null;
}) {
  const act = insights.filter((i) => i.status === "act").length;
  const watch = insights.filter((i) => i.status === "watch").length;
  const good = insights.filter((i) => i.status === "good").length;
  const headline =
    insights.length === 0
      ? "Not enough history yet"
      : act
        ? `${act} to act on`
        : watch
          ? `${watch} to watch`
          : "All on track";

  return (
    <>
      <section className="hero-card hero-card-split">
        <div className="min-w-0">
          <div className="kicker">Checkup</div>
          <div className={cn("display-number", act ? "text-negative" : watch ? "text-accent" : insights.length ? "text-positive" : "")}>
            {headline}
          </div>
          <div className="supporting-line prose-num">
            {insights.length ? (
              <>
                {act && watch ? `${watch} to watch · ` : ""}
                {good} on track
                {payAnnual > 0 ? (
                  <>
                    {" "}
                    · take-home <Money value={payAnnual} /> a year
                  </>
                ) : null}
                {spendAnnual != null ? (
                  <>
                    {" "}
                    · spending <Money value={spendAnnual} /> a year
                  </>
                ) : null}
                {savingsRate != null ? ` · saving ${Math.round(savingsRate * 100)}%` : ""}
              </>
            ) : (
              "Insights needs a full month of transactions. Check back after the next sync."
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="kicker mb-2">Do first</div>
          {actions.length ? (
            <ol className="do-first">
              {actions.map((a) => (
                <li key={a.id}>
                  <span className="do-first-title">{a.title}</span>
                  <span className="prose-num">{withBlurredMoney(a.next)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Callout tone="good">Nothing needs doing. Every measure meets your targets.</Callout>
          )}
        </div>
      </section>

      {insights.length ? (
        <div className="insight-grid">
          {insights.map((c) => (
            <article key={c.id} className="chart-card insight-card" data-status={c.status}>
              <div className="flex items-center justify-between gap-2">
                <span className="kicker">{c.area}</span>
                <StatusChip status={c.status} />
              </div>
              <div className="mt-3 flex items-center gap-1">
                <h3 className="text-sm font-medium">{c.title}</h3>
                <InfoTip label={`How this is worked out: ${c.title}`}>{withBlurredMoney(c.math)}</InfoTip>
              </div>
              <div
                className={cn(
                  "display-number mt-1",
                  c.status === "act" && "text-negative",
                  c.status === "watch" && "text-accent",
                  c.status === "good" && "text-positive",
                )}
              >
                {withBlurredMoney(c.value)}
              </div>
              {c.meter ? (
                <div className="mt-3">
                  <div className="meter-wrap">
                    <div
                      className="meter"
                      data-tone={STATUS[c.status].tone}
                      role="meter"
                      aria-label={`${c.title} against ${c.meter.label.toLowerCase()}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round((c.meter.fill / c.meter.target) * 100)}
                    >
                      <span style={{ width: `${(c.meter.fill * 100).toFixed(1)}%` }} />
                    </div>
                    <span className="meter-tick" style={{ left: `${(c.meter.target * 100).toFixed(1)}%` }} aria-hidden />
                  </div>
                  <div className="footnote mt-1.5 prose-num">{withBlurredMoney(c.meter.label)}</div>
                </div>
              ) : null}
              {c.breakdown ? <InsightBreakdown rows={c.breakdown} /> : null}
              <p className="prose-num mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{withBlurredMoney(c.next)}</p>
              {c.href ? (
                <Link href={c.href} className="insight-link">
                  Open {PAGE[c.href] ?? "page"} <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}
