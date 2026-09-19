"use client";

import { useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Legend,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
  type SankeyLinkProps,
  type SankeyNodeProps,
} from "recharts";
import { formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { DEFAULT_RANGE, inRange, type RangeKey } from "@/lib/range";
import { ChartRange } from "./chart-range";
import { SliceBreakdownDialog, type SliceItem } from "./category-merchants";
import { CategoryIcon, hasCategoryIcon } from "@/lib/category-icons";

const AXIS = { fontSize: 11, fill: "#8B9BB3", fontFamily: "var(--font-geist-sans)" };
const GRID = "rgba(148,163,184,0.12)";
const ICE = "#A8C5E2";
const PALETTE = ["#7EB6E0", "#6FC4B0", "#CBB892", "#8FA0B8", "#D48992", "#9BB4C8", "#B7C9A8", "#A8C5E2", "#C9B7A0", "#7DB8A8"];
const RAINBOW = ["#E06C75", "#E5C07B", "#98C379", "#56B6C2", "#61AFEF", "#C678DD", "#D19A66", "#7DB8A8", "#DE8F6E", "#A8C5E2"];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) >>> 0;
  return RAINBOW[h % RAINBOW.length];
}

function Tip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card-elevated px-3 py-2 text-xs">
      {label ? <div className="mb-1 text-muted-foreground">{label}</div> : null}
      {payload.map((p) => (
        <div key={p.name} className="font-mono tabular-nums">
          {p.name}: {formatMoney(p.value)}
        </div>
      ))}
    </div>
  );
}

export function NetWorthChart({ data }: { data: { date: string; netWorth: number }[] }) {
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const sliced = useMemo(() => data.filter((d) => inRange(d.date, range)), [data, range]);
  if (data.length === 0) {
    return (
      <p className="py-10 text-sm text-muted-foreground">
        History is built from linked transactions, holdings marked at historical prices, and manual lots. Sync an
        institution or add crypto to populate this path.
      </p>
    );
  }
  const tickFmt =
    range === "1m" ? "d MMM" : range === "3m" || range === "6m" ? "MMM" : range === "1y" ? "MMM yyyy" : "yyyy";
  const rows = sliced.map((d) => ({
    ...d,
    label: format(new Date(d.date), tickFmt),
  }));
  const tickEvery = Math.max(1, Math.ceil(rows.length / (range === "all" || range === "1y" ? 6 : 8)));
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <ChartRange value={range} onChange={setRange} />
      </div>
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ICE} stopOpacity={0.42} />
              <stop offset="100%" stopColor={ICE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={tickEvery - 1} minTickGap={28} />
          <YAxis
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            width={72}
            tickFormatter={(v) =>
              new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)
            }
          />
          <Tooltip content={<Tip />} />
          <Area type="monotone" dataKey="netWorth" name="Net worth" stroke={ICE} fill="url(#nw)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    </div>
  );
}

export type AllocSlice = { key: string; value: number; members?: string[]; items?: SliceItem[] };

export function AllocationChart({
  data,
  large,
  showPercent = true,
  onSliceClick,
  selectable,
  selected,
  onToggle,
}: {
  data: AllocSlice[];
  large?: boolean;
  showPercent?: boolean;
  onSliceClick?: (key: string) => void;
  selectable?: boolean;
  selected?: Set<string> | null;
  onToggle?: (key: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const chartId = useId();
  const all = data
    .filter((d) => d.value > 0)
    .slice()
    .sort((a, b) => {
      const ao = isOtherSlice(a.key);
      const bo = isOtherSlice(b.key);
      if (ao !== bo) return ao ? 1 : -1;
      return b.value - a.value;
    });
  const rows = selected == null ? all : all.filter((d) => selected.has(d.key));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const openSlice = all.find((r) => r.key === openKey);
  if (!all.length) {
    return <p className="py-8 text-sm text-muted-foreground">No balances to allocate yet.</p>;
  }
  if (!rows.length) {
    return (
      <div>
        <p className="py-6 text-sm text-muted-foreground">No categories selected.</p>
        <ul className="min-w-0 space-y-1.5 text-sm">
          {all.map((r, i) => (
            <li key={`${r.key}-${i}`} className="flex min-w-0 items-center gap-2">
              <input type="checkbox" className="cursor-pointer" checked={false} onChange={() => onToggle?.(r.key)} />
              <span className="min-w-0 truncate capitalize text-muted-foreground">{r.key.replaceAll("_", " ")}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <>
    <div className={large ? "flex min-h-[28rem] flex-col items-center gap-6 lg:flex-row lg:items-center" : "flex h-80 min-w-0 items-center gap-3"}>
      <div className={large ? "h-[28rem] w-full min-w-0 shrink-0 lg:w-[58%]" : "h-full w-[58%] min-w-[12rem] shrink-0"}>
        <ResponsiveContainer>
          <PieChart
            id={chartId}
            margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
            style={{ shapeRendering: "geometricPrecision", outline: "none" }}
            tabIndex={-1}
          >
            <Pie
              data={rows}
              dataKey="value"
              nameKey="key"
              cx="50%"
              cy="50%"
              innerRadius="56%"
              outerRadius="96%"
              paddingAngle={1.2}
              stroke="none"
              isAnimationActive={false}
              label={
                showPercent
                  ? (props) => {
                      const p = props as {
                        index?: number;
                        payload?: { key?: string };
                        cx?: number;
                        cy?: number;
                        midAngle?: number;
                        innerRadius?: number;
                        outerRadius?: number;
                        percent?: number;
                      };
                      return (
                        <PercentLabel
                          key={`pct-${p.payload?.key ?? p.index ?? 0}`}
                          cx={p.cx}
                          cy={p.cy}
                          midAngle={p.midAngle}
                          innerRadius={p.innerRadius}
                          outerRadius={p.outerRadius}
                          percent={p.percent}
                        />
                      );
                    }
                  : false
              }
              labelLine={false}
              onClick={(_, i) => {
                const row = rows[i];
                if (!row) return;
                if (onSliceClick) onSliceClick(row.key);
                else if (row.items?.length) setOpenKey(row.key);
              }}
              className={onSliceClick || all.some((s) => s.items?.length) ? "cursor-pointer" : undefined}
              style={{ outline: "none" }}
            >
              {rows.map((r, i) => (
                <Cell key={`${r.key}-${i}`} fill={PALETTE[i % PALETTE.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip content={<DonutTip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className={large ? "grid w-full min-w-0 gap-1.5 text-sm sm:grid-cols-2 lg:w-1/2 lg:grid-cols-1" : "min-w-0 max-h-full flex-1 space-y-1 overflow-y-auto text-xs"}>
        {all.map((r, i) => {
          const on = selected == null || selected.has(r.key);
          return (
            <li key={`${r.key}-${i}`} className="flex min-w-0 items-center gap-2">
              {selectable ? (
                <input
                  type="checkbox"
                  className="cursor-pointer"
                  checked={on}
                  onChange={() => onToggle?.(r.key)}
                />
              ) : (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              )}
              <button
                type="button"
                title={[r.key, ...(r.members && r.members.length > 1 ? r.members : [])].join("\n")}
                className={cn(
                  "inline-flex min-w-0 flex-1 items-center gap-1.5 truncate text-left capitalize text-muted-foreground",
                  (onSliceClick || r.items?.length) && "cursor-pointer hover:text-foreground",
                )}
                onClick={() => {
                  if (onSliceClick) onSliceClick(r.key);
                  else if (r.items?.length) setOpenKey(r.key);
                }}
              >
                {hasCategoryIcon(r.key) ? <CategoryIcon category={r.key} /> : null}
                <span className="truncate">{r.key.replaceAll("_", " ")}</span>
              </button>
              <span className="shrink-0 font-mono tabular-nums">{formatMoney(r.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
    <SliceBreakdownDialog
      open={openKey != null && Boolean(openSlice?.items?.length)}
      title={openSlice?.key.replaceAll("_", " ") ?? ""}
      rows={openSlice?.items ?? []}
      onClose={() => setOpenKey(null)}
    />
    </>
  );
}

function DonutTip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload?: AllocSlice }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pct = total > 0 ? (p.value / total) * 100 : 0;
  const members = p.payload?.members?.filter((m) => m && m !== p.name) ?? [];
  return (
    <div className="max-w-xs rounded-md border border-border bg-card-elevated px-3 py-2 text-xs">
      <div className="mb-1 text-muted-foreground">{p.name}</div>
      <div className="font-mono tabular-nums">
        {formatMoney(p.value)} ({formatPct(pct, 1, false)})
      </div>
      {members.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-muted-foreground">
          {members.map((m) => (
            <li key={m} className="truncate">
              {m}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PercentLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) {
  if (percent == null || percent < 0.04) return null;
  const RAD = Math.PI / 180;
  const r = (innerRadius ?? 0) + ((outerRadius ?? 0) - (innerRadius ?? 0)) * 0.52;
  const x = (cx ?? 0) + r * Math.cos(-(midAngle ?? 0) * RAD);
  const y = (cy ?? 0) + r * Math.sin(-(midAngle ?? 0) * RAD);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fill="#e6edf7"
      fontSize={12}
      fontWeight={500}
      fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
      style={{ shapeRendering: "geometricPrecision" }}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}



export function CategoryBars({
  data,
  rangeable,
  onBarClick,
}: {
  data: { label: string; value: number; date?: string }[];
  rangeable?: boolean;
  onBarClick?: (label: string) => void;
}) {
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const sliced = useMemo(() => {
    if (!rangeable) return data;
    const startEligible = data.some((d) => d.date);
    if (!startEligible) return data;
    const sums: Record<string, number> = {};
    for (const d of data) {
      if (d.date && !inRange(d.date, range)) continue;
      sums[d.label] = (sums[d.label] ?? 0) + d.value;
    }
    return Object.entries(sums)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [data, range, rangeable]);
  if (!sliced.length) {
    return <p className="py-8 text-sm text-muted-foreground">No categorized spending in this period.</p>;
  }
  const height = Math.max(280, sliced.length * 28 + 24);
  return (
    <div>
      {rangeable ? (
        <div className="mb-2 flex justify-end">
          <ChartRange value={range} onChange={setRange} />
        </div>
      ) : null}
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer>
        <BarChart
          data={sliced}
          layout="vertical"
          margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
          style={onBarClick ? { cursor: "pointer" } : undefined}
          onClick={(state) => {
            const label = (state as { activeLabel?: string } | null)?.activeLabel;
            if (label && onBarClick) onBarClick(label);
          }}
        >
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
          <YAxis
            type="category"
            dataKey="label"
            width={176}
            interval={0}
            tick={(props) => <CategoryTick {...props} onLabelClick={onBarClick} />}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<Tip />} cursor={false} />
          <Bar
            dataKey="value"
            name="Amount"
            fill={ICE}
            radius={[0, 2, 2, 0]}
            barSize={14}
            cursor={onBarClick ? "pointer" : undefined}
            activeBar={false}
            onClick={(d) => {
              const label = (d as { payload?: { label?: string } })?.payload?.label ?? (d as { label?: string }).label;
              if (label && onBarClick) onBarClick(label);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
    </div>
  );
}

function CategoryTick({
  x,
  y,
  payload,
  onLabelClick,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  onLabelClick?: (label: string) => void;
}) {
  const label = payload?.value ?? "";
  const shown = label.length > 22 ? `${label.slice(0, 20)}…` : label;
  const clickable = Boolean(onLabelClick);
  return (
    <g
      className={clickable ? "cursor-pointer" : undefined}
      onClick={() => {
        if (label && onLabelClick) onLabelClick(label);
      }}
    >
      <foreignObject x={Number(x ?? 0) - 176} y={Number(y ?? 0) - 9} width={172} height={18}>
        <div className="flex h-full items-center justify-end gap-1.5 overflow-hidden pr-1 text-[11px] text-[#8B9BB3]">
          {hasCategoryIcon(label) ? <CategoryIcon category={label} className="h-3 w-3" /> : null}
          <span className="truncate" title={label}>
            {shown}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

export const OTHER_CATEGORIES = "Other categories";
export const FROM_SAVINGS = "From savings";
export const TO_SAVINGS = "To savings";

export function isOtherSlice(key: string) {
  const n = key.trim().toLowerCase().replaceAll("_", " ");
  return n === "other" || n === "other categories";
}

function keepNamed(label: string) {
  return /cash.?back|rewards|rebate/i.test(label);
}

function topSlices(rows: { label: string; value: number }[], limit = 8) {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const pinned = sorted.filter((r) => keepNamed(r.label));
  const rest = sorted.filter((r) => !keepNamed(r.label));
  if (pinned.length + rest.length <= limit) return sorted;
  const room = Math.max(1, limit - 1 - pinned.length);
  const head = [...rest.slice(0, room), ...pinned].sort((a, b) => b.value - a.value);
  const leftover = rest.slice(room).reduce((s, r) => s + r.value, 0);
  if (leftover > 0) head.push({ label: OTHER_CATEGORIES, value: leftover });
  return head;
}

export const TO_INVESTMENTS = "To investments";

export function CashflowSankey({
  income,
  spend,
  invest = 0,
  onSpendClick,
  onIncomeClick,
  onBalanceClick,
}: {
  income: { label: string; value: number }[];
  spend: { label: string; value: number }[];
  invest?: number;
  onSpendClick?: (label: string) => void;
  onIncomeClick?: (label: string) => void;
  onBalanceClick?: (kind: "from-savings" | "to-savings" | "to-investments") => void;
}) {
  const sources = topSlices(income, 7).map((r) => ({
    ...r,
    label: r.label === "Income" ? "Other income" : r.label,
  }));
  const outflows = topSlices(spend, 9);
  const inTotal = sources.reduce((s, r) => s + r.value, 0);
  const outTotal = outflows.reduce((s, r) => s + r.value, 0);
  if (inTotal <= 0 && outTotal <= 0) {
    return <p className="py-10 text-sm text-muted-foreground">No cashflow in this window.</p>;
  }

  const keys: string[] = [];
  const nodes: { name: string; label: string }[] = [];
  const idx = (key: string, label: string) => {
    const found = keys.indexOf(key);
    if (found >= 0) return found;
    keys.push(key);
    nodes.push({ name: key, label });
    return keys.length - 1;
  };
  const links: { source: number; target: number; value: number }[] = [];
  const hub = idx("hub", "Income");
  for (const s of sources) {
    if (!(s.value >= 1) || !Number.isFinite(s.value)) continue;
    links.push({ source: idx(`in:${s.label}`, s.label), target: hub, value: s.value });
  }
  for (const s of outflows) {
    if (!(s.value >= 1) || !Number.isFinite(s.value)) continue;
    links.push({ source: hub, target: idx(`out:${s.label}`, s.label), value: s.value });
  }
  if (invest >= 1 && Number.isFinite(invest)) {
    links.push({ source: hub, target: idx("save:invest", TO_INVESTMENTS), value: invest });
  }
  const saved = inTotal - outTotal - Math.max(0, invest);
  if (saved > 1) links.push({ source: hub, target: idx("save:to", TO_SAVINGS), value: saved });
  else if (saved < -1) links.push({ source: hub, target: idx("save:from", FROM_SAVINGS), value: -saved });

  if (!links.length) {
    return <p className="py-10 text-sm text-muted-foreground">No cashflow in this window.</p>;
  }

  return (
    <div className="h-[28rem] w-full">
      <ResponsiveContainer>
        <Sankey
          data={{ nodes, links }}
          nameKey="name"
          nodeWidth={12}
          nodePadding={18}
          linkCurvature={0.5}
          iterations={16}
          margin={{ left: 108, right: 124, top: 16, bottom: 16 }}
          node={(props) => (
            <SankeyNode
              x={props.x}
              y={props.y}
              width={props.width}
              height={props.height}
              payload={props.payload}
              onSpendClick={onSpendClick}
              onIncomeClick={onIncomeClick}
              onBalanceClick={onBalanceClick}
              spendNames={new Set(outflows.map((s) => s.label))}
              incomeNames={new Set(sources.map((s) => s.label))}
            />
          )}
          link={(props) => (
            <RainbowLink
              sourceX={props.sourceX}
              targetX={props.targetX}
              sourceY={props.sourceY}
              targetY={props.targetY}
              sourceControlX={props.sourceControlX}
              targetControlX={props.targetControlX}
              linkWidth={props.linkWidth}
              payload={props.payload}
              onSpendClick={onSpendClick}
              onIncomeClick={onIncomeClick}
              onBalanceClick={onBalanceClick}
              spendNames={new Set(outflows.map((s) => s.label))}
              incomeNames={new Set(sources.map((s) => s.label))}
            />
          )}
        >
          <Tooltip
            content={({ payload }) => {
              if (!payload?.length) return null;
              const entry = payload[0];
              const row = entry.payload as {
                name?: string;
                label?: string;
                value?: number;
                source?: { name?: string; label?: string };
                target?: { name?: string; label?: string };
              };
              const src = sankeyLabel(row?.source);
              const tgt = sankeyLabel(row?.target);
              const raw = src && tgt ? (tgt !== "Income" ? tgt : src) : sankeyLabel(row) || String(entry.name ?? "");
              const label = raw.replace(/^Income\s*[-–:]\s*/i, "");
              const value = typeof row.value === "number" ? row.value : Number(payload[0].value);
              return (
                <div className="rounded-md border border-border bg-card-elevated px-3 py-2 text-xs">
                  <div className="mb-1 text-muted-foreground">{label}</div>
                  <div className="font-mono tabular-nums">{formatMoney(value)}</div>
                </div>
              );
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

function sankeyLabel(n: { name?: string; label?: string } | undefined | null): string {
  if (!n) return "";
  return String(n.label || n.name || "").replace(/^(in|out|save|hub):/i, "");
}

function RainbowLink({
  sourceX,
  targetX,
  sourceY,
  targetY,
  sourceControlX,
  targetControlX,
  linkWidth,
  payload,
  onSpendClick,
  onIncomeClick,
  onBalanceClick,
  spendNames,
  incomeNames,
}: Pick<
  SankeyLinkProps,
  "sourceX" | "targetX" | "sourceY" | "targetY" | "sourceControlX" | "targetControlX" | "linkWidth" | "payload"
> & {
  onSpendClick?: (label: string) => void;
  onIncomeClick?: (label: string) => void;
  onBalanceClick?: (kind: "from-savings" | "to-savings" | "to-investments") => void;
  spendNames?: Set<string>;
  incomeNames?: Set<string>;
}) {
  const srcName = sankeyLabel(payload?.source);
  const tgtName = sankeyLabel(payload?.target);
  const d = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  const clickable =
    (onSpendClick && spendNames?.has(tgtName)) ||
    (onIncomeClick && incomeNames?.has(srcName)) ||
    tgtName === FROM_SAVINGS ||
    tgtName === TO_SAVINGS ||
    tgtName === TO_INVESTMENTS;
  const strokeName =
    tgtName === FROM_SAVINGS || tgtName === TO_SAVINGS || tgtName === TO_INVESTMENTS ? tgtName : srcName;
  return (
    <path
      d={d}
      fill="none"
      stroke={colorFor(strokeName)}
      strokeWidth={Math.max(Number(linkWidth) || 2, 2)}
      strokeOpacity={0.55}
      className={clickable ? "cursor-pointer" : undefined}
      onClick={() => {
        if (tgtName === FROM_SAVINGS) onBalanceClick?.("from-savings");
        else if (tgtName === TO_SAVINGS) onBalanceClick?.("to-savings");
        else if (tgtName === TO_INVESTMENTS) onBalanceClick?.("to-investments");
        else if (onSpendClick && spendNames?.has(tgtName)) onSpendClick(tgtName);
        else if (onIncomeClick && incomeNames?.has(srcName)) onIncomeClick(srcName);
      }}
    />
  );
}

function SankeyNode({
  x,
  y,
  width,
  height,
  payload,
  onSpendClick,
  onIncomeClick,
  onBalanceClick,
  spendNames,
  incomeNames,
}: Pick<SankeyNodeProps, "x" | "y" | "width" | "height" | "payload"> & {
  onSpendClick?: (label: string) => void;
  onIncomeClick?: (label: string) => void;
  onBalanceClick?: (kind: "from-savings" | "to-savings" | "to-investments") => void;
  spendNames?: Set<string>;
  incomeNames?: Set<string>;
}) {
  const rawName = sankeyLabel(payload as { name?: string; label?: string });
  const outgoing = ((payload as { targetNodes?: number[] })?.targetNodes ?? []).length > 0;
  const incoming = ((payload as { sourceNodes?: number[] })?.sourceNodes ?? []).length > 0;
  const right = incoming && !outgoing;
  const name = right ? rawName.replace(/^Income\s*[-–:]\s*/i, "") : rawName;
  const cx = Number(x ?? 0);
  const cy = Number(y ?? 0);
  const w = Number(width ?? 0);
  const h = Number(height ?? 0);
  const spend = Boolean(onSpendClick && spendNames?.has(name));
  const income = Boolean(onIncomeClick && incomeNames?.has(name));
  const balance = name === FROM_SAVINGS || name === TO_SAVINGS || name === TO_INVESTMENTS;
  const clickable = spend || income || balance;
  const lines = wrapLabel(name, 13);
  const labelW = 108;
  const labelH = Math.max(h, 12 * lines.length + 4);
  const labelX = right ? cx + w + 4 : cx - 4 - labelW;
  const labelY = cy + (Math.max(h, 2) - labelH) / 2;
  const textX = right ? cx + w + 8 : cx - 8;
  const textY = cy + Math.max(h, 2) / 2 - ((lines.length - 1) * 12) / 2;
  return (
    <g
      className={clickable ? "cursor-pointer" : undefined}
      onClick={() => {
        if (name === FROM_SAVINGS) onBalanceClick?.("from-savings");
        else if (name === TO_SAVINGS) onBalanceClick?.("to-savings");
        else if (name === TO_INVESTMENTS) onBalanceClick?.("to-investments");
        else if (spend && onSpendClick) onSpendClick(name);
        else if (income && onIncomeClick) onIncomeClick(name);
      }}
    >
      <rect x={cx} y={cy} width={w} height={Math.max(h, 2)} fill={colorFor(name)} rx={1} />
      {clickable ? <rect x={labelX} y={labelY} width={labelW} height={labelH} fill="transparent" /> : null}
      <text
        x={textX}
        y={textY}
        textAnchor={right ? "start" : "end"}
        dominantBaseline="middle"
        fill="#C9D4E3"
        fontSize={11}
        fontFamily="var(--font-geist-sans)"
      >
        {lines.map((ln, i) => (
          <tspan key={i} x={textX} dy={i === 0 ? 0 : 12}>
            {ln}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function wrapLabel(name: string, width = 13): string[] {
  if (name.length <= width) return [name];
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= width) cur = next;
    else {
      if (cur) lines.push(cur);
      if (word.length > width) {
        for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
        cur = "";
      } else cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

export function ValueDebtChart({
  rows,
}: {
  rows: { label: string; value: number; debt: number; equity: number }[];
}) {
  if (!rows.length) return null;
  const data = rows.map((r) => ({
    ...r,
    label: r.label.length > 18 ? `${r.label.slice(0, 16)}…` : r.label,
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
          <YAxis
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(v) =>
              new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)
            }
          />
          <Tooltip content={<Tip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#8B9BB3" }} />
          <Bar dataKey="value" name="Value" fill="#61AFEF" radius={[2, 2, 0, 0]} />
          <Bar dataKey="debt" name="Debt" fill="#E06C75" radius={[2, 2, 0, 0]} />
          <Bar dataKey="equity" name="Equity" fill="#98C379" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
