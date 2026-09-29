"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { Delta } from "@/components/money";
import { formatMoney } from "@/lib/format";
import type { SparkPoint } from "@/lib/sparkline";

/** The summary card's right side on Stocks and Crypto: the last 30 days as a small line, with its change. */
export function SparklineAside({
  points,
  change,
  pct,
  label = "Last 30 days",
}: {
  points: SparkPoint[];
  change: number | null;
  pct: number | null;
  label?: string;
}) {
  const id = useId().replace(/:/g, "");
  if (points.length < 2) {
    return (
      <div className="sparkline-aside">
        <span className="kicker">{label}</span>
        <div className="sparkline-placeholder mt-2 h-20 sm:h-24">The line appears once a few days of prices are stored.</div>
      </div>
    );
  }
  const up = (change ?? 0) >= 0;
  // Pad the scale to at least ±1% of the value, so a quiet month reads as quiet instead of as peaks.
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.1, hi * 0.01);
  const color = up ? "var(--positive)" : "var(--negative)";
  return (
    <div className="sparkline-aside">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="kicker">{label}</span>
        <span className="text-sm">
          <Delta value={change} pct={pct} />
        </span>
      </div>
      <div className="mt-2 h-20 w-full sm:h-24">
        <ResponsiveContainer>
          <AreaChart data={points} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[lo - pad, hi + pad]} />
            <Tooltip
              cursor={{ stroke: "rgba(148,163,184,0.35)" }}
              formatter={(v) => [<span key="v" className="money">{formatMoney(Number(v))}</span>, "Value"]}
              labelFormatter={(_, p) => {
                const d = p?.[0]?.payload?.date as string | undefined;
                return d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
              }}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#spark-${id})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
