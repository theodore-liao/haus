"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Callout } from "@/components/callout";
import { Money } from "@/components/money";
import { NumberField } from "@/components/number-field";
import { amortize, loanLife, remainingFromPayment, yearLabel } from "@/lib/amortization";
import { formatMoney } from "@/lib/format";

const AXIS = { fontSize: 11, fill: "#8fa0b8", fontFamily: "var(--font-geist-sans)" };
const GRID = "rgba(148,163,184,0.12)";
// What's still owed, and what has gone to principal and to interest so far.
const OWED = "#7EABD4";
const PRINCIPAL = "#6FC4B0";
const INTEREST = "#D48992";
const SERIES = [
  { key: "owed", label: "Still owed", color: OWED },
  { key: "principal", label: "Principal paid", color: PRINCIPAL },
  { key: "interest", label: "Interest paid", color: INTEREST },
] as const;

function span(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y && m) return `${y} yr ${m} mo`;
  return y ? `${y} yr` : `${m} mo`;
}

/** A round extra payment to suggest: about a tenth of principal and interest, at least $100. */
function suggestedExtra(pi: number) {
  return Math.max(100, Math.round(pi / 10 / 50) * 50);
}

function compact(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 3 }).format(n);
}

export function HomeLoan({
  id,
  balance,
  rate,
  pi,
  escrow,
  pmi,
  estimate,
  rent,
  savedExtra,
  originationDate,
  originalTermMonths,
  summary,
}: {
  id: string;
  balance: number;
  rate: number;
  /** Monthly principal and interest. */
  pi: number;
  escrow: number;
  pmi: number;
  estimate: number;
  rent: number | null;
  savedExtra: number | null;
  /** When the loan began (YYYY-MM-DD) and its original term, so the chart can start at the first payment. */
  originationDate: string | null;
  originalTermMonths: number | null;
  /** The home's equity and value, shown above the loan in the left column. */
  summary: ReactNode;
}) {
  const router = useRouter();
  const [extra, setExtra] = useState<number | null>(savedExtra && savedExtra > 0 ? savedExtra : null);

  const n = useMemo(() => remainingFromPayment(balance, rate, pi), [balance, rate, pi]);
  const base = useMemo(() => (n > 0 ? amortize({ principal: balance, aprPct: rate, remainingMonths: n }) : null), [balance, rate, n]);
  const tryExtra = extra ?? suggestedExtra(pi);
  const faster = useMemo(
    () => (n > 0 ? amortize({ principal: balance, aprPct: rate, remainingMonths: n, extraPrincipal: tryExtra }) : null),
    [balance, rate, n, tryExtra],
  );

  const save = async (v: number | null) => {
    setExtra(v && v > 0 ? v : null);
    const res = await fetch("/api/properties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, extraPrincipal: v && v > 0 ? v : null }),
    }).catch(() => null);
    if (!res?.ok) toast.error("Could not save the extra payment.");
    else router.refresh();
  };

  if (!base) return null;

  const payment = pi + escrow + pmi;
  const pmiEnds = pmi > 0 ? base.months.find((m) => m.balance <= estimate * 0.8) : null;
  const pmiEndDate = pmiEnds ? new Date(new Date().getFullYear(), new Date().getMonth() + pmiEnds.i + 1, 1) : null;
  const savedInterest = faster ? base.interestRemaining - faster.interestRemaining : 0;
  const soonerMonths = faster ? base.remainingMonths - faster.remainingMonths : 0;

  // The loan's whole life on one year axis: what's owed, and principal and interest paid since it began, month by month.
  const life = loanLife({
    balance,
    aprPct: rate,
    pi,
    originationDate: originationDate ? new Date(`${originationDate}T12:00:00`) : null,
    originalTermMonths,
  });
  const xOf = (d: Date) => d.getFullYear() + d.getMonth() / 12;
  const todayX = life ? xOf(life.points[life.todayIndex].at) : xOf(new Date());
  const chart = (life?.points ?? []).map((pt, i) => {
    const sinceToday = i - (life?.todayIndex ?? 0);
    return {
      x: xOf(pt.at),
      at: pt.at.getTime(),
      owed: Math.max(0, pt.balance),
      principal: pt.principalPaid,
      interest: pt.interestPaid,
      // Extra payments start next month, so the dashed line leaves the balance today.
      extra: extra && faster && sinceToday >= 0 ? (sinceToday === 0 ? balance : Math.max(0, faster.months[sinceToday - 1]?.balance ?? 0)) : undefined,
    };
  });
  const firstTick = Math.ceil(chart[0]?.x ?? todayX);
  const lastTick = Math.floor(chart[chart.length - 1]?.x ?? todayX);
  const years = lastTick - firstTick;
  const step = years <= 6 ? 1 : years <= 12 ? 2 : years <= 40 ? 5 : 10;
  const ticks = Array.from({ length: Math.floor((lastTick - firstTick) / step) + 1 }, (_, i) => firstTick + i * step);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="min-w-0 space-y-4">
        {summary}
        <div className="stat-row">
          <div className="stat">
            <div className="kicker">Payment a month</div>
            <div className="display-number">
              <Money value={payment} />
            </div>
            <div className="stat-sub prose-num">
              <Money value={pi} /> loan{escrow > 0 ? <> · <Money value={escrow} /> taxes and insurance</> : null}
              {pmi > 0 ? <> · <Money value={pmi} /> PMI</> : null}
            </div>
          </div>
          <div className="stat">
            <div className="kicker">Interest left to pay</div>
            <div className="display-number">
              <Money value={base.interestRemaining} />
            </div>
            <div className="stat-sub prose-num">
              {rate.toFixed(2)}% · {span(base.remainingMonths)} left · paid off {yearLabel(base.payoff)}
            </div>
          </div>
        </div>

        {pmiEndDate ? (
          <Callout tone="info">
            PMI can end around {yearLabel(pmiEndDate)}, when the loan falls to 80% of today&apos;s value. Ask the lender to drop it then.
          </Callout>
        ) : null}
        {rent != null && rent > 0 ? (
          <Callout tone={rent >= payment ? "good" : "bad"}>
            <span className="prose-num">
              Rent of <Money value={rent} /> {rent >= payment ? "covers" : "falls short of"} the payment by{" "}
              <Money value={Math.abs(rent - payment)} /> a month.
            </span>
          </Callout>
        ) : null}

        <div className="field-grid field-grid-wide">
          <NumberField
            label="Extra toward principal"
            value={extra}
            onValue={(v) => void save(v)}
            prefix="$"
            suffix="/ mo"
            money
            min={0}
            max={Math.max(1, Math.floor(balance))}
            allowBlank
            placeholder={`e.g. ${suggestedExtra(pi)}`}
            help={extra ? "Saved. Clear the box to remove it." : "Try an amount to see what it saves."}
          />
        </div>
        {faster && savedInterest > 1 ? (
          <Callout tone={extra ? "good" : "info"}>
            {extra ? (
              <span className="prose-num">
                Paying <Money value={tryExtra} /> extra a month saves <Money value={savedInterest} /> of interest and pays the loan off{" "}
                {span(soonerMonths)} sooner, in {yearLabel(faster.payoff)}.
              </span>
            ) : (
              <span className="prose-num">
                For example, <Money value={tryExtra} /> extra a month would save <Money value={savedInterest} /> of interest and end the
                loan {span(soonerMonths)} sooner.
              </span>
            )}
          </Callout>
        ) : null}
      </div>

      <div className="min-w-0">
        <div className="kicker mb-2">Loan over time</div>
        <div className="h-64 w-full sm:h-72">
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} ticks={ticks} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={{ ...AXIS, className: "money" }} axisLine={false} tickLine={false} width={60} tickFormatter={compact} />
              <Tooltip
                formatter={(v, key) => [
                  <span key="v" className="money">
                    {formatMoney(Number(v))}
                  </span>,
                  key === "extra" ? "Owed with extra" : (SERIES.find((s) => s.key === key)?.label ?? String(key)),
                ]}
                labelFormatter={(_, rows) => {
                  const at = rows?.[0]?.payload?.at as number | undefined;
                  if (at == null) return "";
                  const when = new Date(at);
                  const label = `${when.toLocaleString("en-US", { month: "short" })} ${when.getFullYear()}`;
                  return Math.abs(xOf(when) - todayX) < 0.01 ? `${label} (today)` : label;
                }}
                separator=": "
                // The same order as the key under the chart.
                itemSorter={(item) => {
                  const at = SERIES.findIndex((s) => s.key === item.dataKey);
                  return at < 0 ? SERIES.length : at;
                }}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              {SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={s.color}
                  fillOpacity={0.12}
                  dot={false}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                />
              ))}
              {extra ? (
                <Line type="monotone" dataKey="extra" stroke="var(--positive)" strokeWidth={2.25} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />
              ) : null}
              {/* Only a loan with a past needs telling where today is. */}
              {life && life.todayIndex > 0 ? (
                <ReferenceLine
                  x={todayX}
                  stroke="#8fa0b8"
                  strokeDasharray="3 4"
                  label={{ value: "Today", position: "top", fill: "#8fa0b8", fontSize: 11 }}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
          {extra ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-positive" /> Owed with extra payments
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
