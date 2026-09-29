"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Callout } from "@/components/callout";
import { Money } from "@/components/money";
import { NumberField } from "@/components/number-field";
import { amortize, remainingFromPayment, yearLabel } from "@/lib/amortization";
import { formatMoney } from "@/lib/format";

const AXIS = { fontSize: 11, fill: "#8fa0b8", fontFamily: "var(--font-geist-sans)" };
const GRID = "rgba(148,163,184,0.12)";
const NOW_LINE = "#7EABD4";

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

  // Balances at the end of each year, starting from today, on one year axis.
  const now = new Date();
  const todayX = now.getFullYear() + now.getMonth() / 12;
  const chart = [
    { x: todayX, now: balance, extra: extra ? balance : undefined },
    ...base.years.map((y) => ({
      x: y.year + 1,
      now: Math.max(0, y.endBalance),
      extra: extra && faster ? Math.max(0, faster.years.find((f) => f.year === y.year)?.endBalance ?? 0) : undefined,
    })),
  ];
  const firstTick = Math.ceil(todayX);
  const lastTick = chart[chart.length - 1].x;
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
            max={1_000_000}
            allowBlank
            placeholder={String(suggestedExtra(pi))}
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
        <div className="kicker mb-2">Loan balance</div>
        <div className="h-64 w-full sm:h-72">
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} ticks={ticks} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={{ ...AXIS, className: "money" }} axisLine={false} tickLine={false} width={60} tickFormatter={compact} />
              <Tooltip
                formatter={(v, key) => [formatMoney(Number(v)), key === "now" ? "On schedule" : "With extra"]}
                labelFormatter={(x) => (Number(x) === todayX ? "Today" : `End of ${Number(x) - 1}`)}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="now" stroke={NOW_LINE} strokeWidth={2.25} dot={false} isAnimationActive={false} />
              {extra ? (
                <Line type="monotone" dataKey="extra" stroke="var(--positive)" strokeWidth={2.25} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* A key only earns its place once there are two lines to tell apart. */}
        {extra ? (
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: NOW_LINE }} /> On schedule
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-positive" /> With extra payments
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
