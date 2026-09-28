"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { colorFor } from "@/lib/category-colors";
import { formatMoney } from "@/lib/format";
import type { TrendPoint } from "@/lib/spend-compare";

const AXIS = { fontSize: 11, fill: "#8fa0b8", fontFamily: "var(--font-geist-sans)" };
const GRID = "rgba(148,163,184,0.12)";

/** One category's spend per month. The open month is faded because it is not over yet. */
export function CategoryTrendChart({ category, data }: { category: string; data: TrendPoint[] }) {
  const complete = data.filter((d) => !d.partial);
  const average = complete.length ? complete.reduce((s, d) => s + d.value, 0) / complete.length : null;
  const color = colorFor(category);
  return (
    <div>
      <div className="footnote mb-1 flex flex-wrap justify-between gap-2">
        <span>By month</span>
        {average != null ? (
          <span>
            Average <span className="money num">{formatMoney(average)}</span> a month
          </span>
        ) : null}
      </div>
      <div className="h-36 w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ ...AXIS, className: "money" }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)}
            />
            {average != null ? <ReferenceLine y={average} stroke="rgba(203,184,146,0.7)" strokeDasharray="4 3" /> : null}
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.08)" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as TrendPoint | undefined;
                if (!active || !p) return null;
                return (
                  <div className="rounded-md border border-border bg-card-elevated px-3 py-2 text-xs">
                    <div className="mb-1 text-muted-foreground">
                      {p.label}
                      {p.partial ? " (so far)" : ""}
                    </div>
                    <div className="num money">{formatMoney(p.value)}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.month} fill={color} fillOpacity={d.partial ? 0.4 : 0.9} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
