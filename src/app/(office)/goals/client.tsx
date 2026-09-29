"use client";

import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroCard } from "@/components/hero-card";
import { Pill, Pills } from "@/components/pills";
import { Money } from "@/components/money";
import { SectionLabel, kickerClass } from "@/components/type";
import { cn } from "@/lib/utils";
import { netStatus, type BudgetTracker, type TrackerCell } from "@/lib/budget-tracker";
import type { Insight } from "@/lib/insights";
import { withBlurredMoney } from "@/components/blur-money";
import { InfoTip } from "@/components/info-tip";
import { InsightBreakdown } from "@/components/insight-breakdown";

const INSIGHT_TONE: Record<Insight["status"], string> = { act: "bad", watch: "warn", good: "good", info: "info" };
const TONE_ACCENT: Record<string, string> = { good: "#6FC4B0", warn: "#D4BE7A", bad: "#D48992", info: "#7EABD4" };
const NET: Record<"ahead" | "behind" | "even", { label: string; tone: string }> = {
  ahead: { label: "Ahead", tone: "good" },
  behind: { label: "Behind", tone: "bad" },
  even: { label: "On budget", tone: "info" },
};

function EditBudgets({ label = "Edit budgets" }: { label?: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href="/spending#budget">
        <SlidersHorizontal aria-hidden className="size-3.5" />
        {label}
      </Link>
    </Button>
  );
}

export function GoalsClient({
  tracker,
  linked,
  monthBudget,
  daysLeft,
  reserve,
  retirement,
  retirementOn,
}: {
  tracker: BudgetTracker;
  /** At least one account is linked, so Spending has a Budget card. */
  linked: boolean;
  /** This month's whole budget, every category. */
  monthBudget: number;
  daysLeft: number;
  reserve: Insight | null;
  retirement: Insight | null;
  retirementOn: boolean;
}) {
  const { rows, months, totals, net } = tracker;
  const status = netStatus(net);
  const ahead = rows.filter((r) => netStatus(r.net) === "ahead");
  const behind = rows.filter((r) => netStatus(r.net) === "behind");
  const best = ahead.length ? ahead[ahead.length - 1] : null;
  const worst = behind.length ? behind[0] : null;
  const current = totals[totals.length - 1];
  const span = months.length ? `${months[0].label}–${months[months.length - 1].label}` : "";

  return (
    <>
      <HeroCard
        kicker="Budget, last 3 months"
        supporting={
          rows.length === 0 ? (
            linked ? "Set monthly budgets on Spending to see where you come out ahead or behind." : "Budgets start once accounts are linked."
          ) : (
            <span className="prose-num">
              Against today&apos;s budgets, {span}, with {months[months.length - 1].label} counted through today.
              <span className="block">
                This month: <Money value={current.spent} /> spent of <Money value={monthBudget} />, {daysLeft} {daysLeft === 1 ? "day" : "days"} left.
              </span>            </span>
          )
        }
        aside={
          rows.length ? (
            <Pills compact>
              <Pill kicker="Categories ahead" accent={TONE_ACCENT.good}>
                {ahead.length}
              </Pill>
              <Pill kicker="Categories behind" accent={TONE_ACCENT.bad}>
                {behind.length}
              </Pill>
              <Pill kicker="Most ahead" accent={TONE_ACCENT.good}>
                <span className="block truncate text-[0.8em]" title={best?.category}>
                  {best?.category ?? "—"}
                </span>
              </Pill>
              <Pill kicker="Most behind" accent={TONE_ACCENT.bad}>
                <span className="block truncate text-[0.8em]" title={worst?.category}>
                  {worst?.category ?? "—"}
                </span>
              </Pill>
            </Pills>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn(status === "ahead" && "text-positive", status === "behind" && "text-negative")}>
            <Money value={Math.abs(net)} />
            <span className="ml-2 text-[0.45em] font-medium text-muted-foreground">{status === "even" ? "on budget" : status}</span>
          </span>
        )}
      </HeroCard>

      <section className="space-y-3">
        <div className="goal-section-head">
          <SectionLabel className="mb-0">Budget by month</SectionLabel>
          {rows.length ? <EditBudgets /> : null}
        </div>
        {rows.length === 0 ? (
          <div className="chart-card flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {linked ? "No budgets yet. Set one per category on Spending." : "Budgets start once accounts are linked."}
            </p>
            {linked ? (
              <EditBudgets label="Set budgets" />
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href="/connections">
                  Link accounts <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="chart-card">
            <p className="footnote mb-3">
              Budget minus spent: <span className="text-positive">green</span> is saved, <span className="text-negative">red</span> is over.
            </p>
            {/* Wide screens: one table. */}
            <div className="soft-scroll hidden max-h-[32rem] sm:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left">
                  <tr className={cn("border-b border-border", kickerClass)}>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3 text-right">Budget / mo</th>
                    {months.map((m) => (
                      <th key={m.ym} className="py-2 pr-3 text-right">
                        {m.label}
                        {m.partial ? ", so far" : ""}
                      </th>
                    ))}
                    <th className="py-2 pr-3 text-right">Net, 3 months</th>
                    <th className="py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.category}>
                      <td className="max-w-[14rem] truncate py-2.5 pr-3" title={r.category}>
                        {r.category}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-muted-foreground">
                        <Money value={r.monthly} />
                      </td>
                      {r.cells.map((c, i) => (
                        <td key={months[i].ym} className="py-2.5 pr-3 text-right">
                          <Diff cell={c} />
                        </td>
                      ))}
                      <td className="py-2.5 pr-3 text-right font-semibold">
                        <Money value={r.net} signed />
                      </td>
                      <td className="py-2.5 text-right">
                        <NetChip net={r.net} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border text-sm font-semibold">
                  <tr>
                    <td className="py-2.5 pr-3">All budgets</td>
                    <td className="py-2.5 pr-3 text-right text-muted-foreground">
                      <Money value={monthBudget} />
                    </td>
                    {totals.map((c, i) => (
                      <td key={months[i].ym} className="py-2.5 pr-3 text-right">
                        <Diff cell={c} />
                      </td>
                    ))}
                    <td className="py-2.5 pr-3 text-right">
                      <Money value={net} signed />
                    </td>
                    <td className="py-2.5 text-right">
                      <NetChip net={net} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Phones: one small card a category. */}
            <ul className="space-y-3 sm:hidden">
              {rows.map((r) => (
                <li key={r.category} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm">{r.category}</span>
                    <NetChip net={r.net} />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      <Money value={r.monthly} /> / mo
                    </span>
                    <span className="whitespace-nowrap text-sm font-semibold text-foreground">
                      <Money value={r.net} signed /> <span className="font-normal text-muted-foreground">net, 3 mo</span>
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    {r.cells.map((c, i) => (
                      <div key={months[i].ym}>
                        <div className="text-muted-foreground">
                          {months[i].label}
                          {months[i].partial ? " so far" : ""}
                        </div>
                        <Diff cell={c} />
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="goal-section-head">
          <SectionLabel className="mb-0">Staying on track</SectionLabel>
        </div>
        <div className="goal-grid">
          {reserve ? (
            <InsightGoal insight={reserve} title="Emergency fund" />
          ) : (
            <QuietGoal title="Emergency fund" text="Link a bank or card account so Haus can measure your emergency fund." href="/connections" link="Open Connections" />
          )}
          {retirement ? (
            <InsightGoal insight={retirement} title="Retirement" />
          ) : (
            <QuietGoal
              title="Retirement"
              text={retirementOn ? "The Retirement planner needs your pay and spending to judge this." : "Turn on Retirement in Settings to plan for it here."}
              href={retirementOn ? "/retirement" : "/settings"}
              link={retirementOn ? "Open Retirement" : "Open Settings"}
            />
          )}
        </div>
      </section>
    </>
  );
}

/** Saved (green, +) or over (red, −) for one month; a month with nothing budgeted yet reads as a dash. */
function Diff({ cell }: { cell: TrackerCell }) {
  if (cell.budget <= 0 && cell.spent <= 0) return <span className="text-muted-foreground">—</span>;
  return <Money value={cell.diff} signed />;
}

function NetChip({ net }: { net: number }) {
  const s = NET[netStatus(net)];
  return (
    <span className="status-chip" data-tone={s.tone}>
      {s.label}
    </span>
  );
}

function StatusChip({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="status-chip" data-tone={tone}>
      {label}
    </span>
  );
}

function QuietGoal({ title, text, href, link }: { title: string; text: string; href: string; link: string }) {
  return (
    <article className="chart-card insight-card">
      <span className="kicker">{title}</span>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
      <Link href={href} className="insight-link">
        {link} <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </article>
  );
}

function InsightGoal({ insight, title }: { insight: Insight; title: string }) {
  const tone = INSIGHT_TONE[insight.status];
  return (
    <article className="chart-card insight-card">
      <div className="flex items-center justify-between gap-2">
        <span className="kicker inline-flex items-center gap-1">
          {title}
          <InfoTip label={`How this is worked out: ${title}`}>{withBlurredMoney(insight.math)}</InfoTip>
        </span>
        <StatusChip tone={tone} label={insight.status === "act" ? "Act" : insight.status === "watch" ? "Watch" : insight.status === "good" ? "On track" : "For reference"} />
      </div>
      <div
        className={cn(
          "display-number mt-3",
          insight.status === "act" && "text-negative",
          insight.status === "watch" && "text-accent",
          insight.status === "good" && "text-positive",
        )}
      >
        <span className="money">{insight.value}</span>
      </div>
      {insight.meter ? (
        <div className="mt-3">
          <div className="meter-wrap">
            <div className="meter" data-tone={tone}>
              <span style={{ width: `${(insight.meter.fill * 100).toFixed(1)}%` }} />
            </div>
            <span className="meter-tick" style={{ left: `${(insight.meter.target * 100).toFixed(1)}%` }} aria-hidden />
          </div>
          <div className="footnote prose-num mt-1.5">{withBlurredMoney(insight.meter.label)}</div>
        </div>
      ) : null}
      {insight.breakdown ? <InsightBreakdown rows={insight.breakdown} /> : null}
      <p className="prose-num mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{withBlurredMoney(insight.next)}</p>
      {insight.href ? (
        <Link href={insight.href} className="insight-link">
          Open {insight.href === "/retirement" ? "Retirement" : "Spending"} <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      ) : null}
    </article>
  );
}
