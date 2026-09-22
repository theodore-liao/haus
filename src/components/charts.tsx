"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { formatLegendLabel, formatMoney, formatPct, splitHolder } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OwnerTag } from "./type";
import { format } from "date-fns";
import { inRange } from "@/lib/range";
import { ChartRange, useChartRange } from "./chart-range";
import { SliceBreakdownDialog, type SliceItem } from "./category-merchants";
import { CategoryIcon, hasCategoryIcon } from "@/lib/category-icons";
import { colorFor, donutColorMap } from "@/lib/category-colors";
import { FROM_SAVINGS, isOtherSlice, OTHER_CATEGORIES, TO_INVESTMENTS, TO_SAVINGS } from "@/lib/flow-labels";

const AXIS = { fontSize: 11, fill: "#8fa0b8", fontFamily: "var(--font-geist-sans)" };
const MONEY_AXIS = { ...AXIS, className: "money" };
const GRID = "rgba(148,163,184,0.12)";
const ICE = "#A8C5E2";
const PALETTE = [
  "#7EABD4",
  "#D4928C",
  "#7DB8A4",
  "#D4BE7A",
  "#A898CC",
  "#78C0C4",
  "#D4A878",
  "#D49AB0",
  "#94C48C",
  "#8EA4DC",
  "#C4A898",
  "#7CBCB0",
  "#C8C47A",
  "#86B8D4",
  "#C49AC4",
  "#E0A898",
  "#88C4A8",
  "#D4B85C",
  "#9A9AD0",
  "#E0B07A",
  "#70C4BC",
  "#B8A0D0",
  "#D4C888",
  "#7AB4D4",
];
const HUB_FILL = "#8B9BB3";
const SAVED_FILL = "#6FC4B0";
const DRAWN_FILL = "#D48992";
const INVEST_FILL = "#8EA4DC";
/** Sankey-only fills so restored donut teals do not collapse rental / loan / shopping / savings. */
const SANKEY_FILLS: Record<string, string> = {
  Shopping: "#C48A9A",
  "General merchandise": "#C48A9A",
  "Loan payments": "#C4785C",
  "Rental income": "#5B8FD4",
};
function sankeyFill(label: string, fixed?: string) {
  return fixed ?? SANKEY_FILLS[label] ?? colorFor(label);
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
        <div key={p.name} className="num">
          {p.name}: <span className="money">{formatMoney(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function NetWorthChart({ data }: { data: { date: string; netWorth: number }[] }) {
  const [range, setRange] = useChartRange();
  const sliced = useMemo(() => data.filter((d) => inRange(d.date, range)), [data, range]);
  if (data.length === 0) {
    return (
      <p className="py-10 text-sm text-muted-foreground">
        History is built from linked transactions, holdings marked at historical prices, and manual entries. Sync an
        institution or add crypto to populate this path.
      </p>
    );
  }
  // Sub-year windows label by day so adjacent ticks never read "Aug Aug Aug".
  const tickFmt = range === "1m" || range === "3m" || range === "6m" ? "d MMM" : "MMM yyyy";
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
            tick={MONEY_AXIS}
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
  showPercent = true,
  onSliceClick,
  selectable = true,
  selected: selectedProp,
  onToggle: onToggleProp,
  defaultOff,
  onSelectionChange,
  size,
  className,
}: {
  data: AllocSlice[];
  /** Kept for call-site compatibility; layout now follows the container width. */
  large?: boolean;
  showPercent?: boolean;
  onSliceClick?: (key: string) => void;
  /** Every donut can be filtered from its legend; pass false to hide the checkboxes. */
  selectable?: boolean;
  /** Controlled selection. When omitted the chart keeps its own, seeded from `defaultOff`. */
  selected?: Set<string> | null;
  onToggle?: (key: string) => void;
  /** Keys unchecked on first render (uncontrolled mode). */
  defaultOff?: string[];
  /** Fires with the visible rows whenever the (uncontrolled) selection changes. */
  onSelectionChange?: (rows: AllocSlice[]) => void;
  /** `large` for a page whose only content is this donut. */
  size?: "large";
  className?: string;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Uncontrolled selection is stored as the set of *unchecked* keys so new slices default to on.
  const [off, setOff] = useState<Set<string>>(() => new Set(defaultOff ?? []));
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
  const controlled = selectedProp !== undefined && onToggleProp !== undefined;
  const selected: Set<string> | null = controlled
    ? selectedProp
    : off.size === 0
      ? null
      : new Set(all.map((d) => d.key).filter((k) => !off.has(k)));
  const onToggle = controlled
    ? onToggleProp
    : (key: string) => {
        setOff((cur) => {
          const next = new Set(cur);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          onSelectionChange?.(all.filter((d) => !next.has(d.key)));
          return next;
        });
      };
  const rows = selected == null ? all : all.filter((d) => selected.has(d.key));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const openSlice = all.find((r) => r.key === openKey);
  // Named slices keep a fixed swatch. Other rings walk the same palette in name order.
  const colorMap = donutColorMap(all.map((d) => d.key));
  const colorAt = (key: string) => colorMap.get(key) ?? colorFor(key);
  if (!all.length) {
    return <p className="py-8 text-sm text-muted-foreground">No balances to allocate yet.</p>;
  }
  if (!rows.length) {
    return (
      <div>
        <p className="py-6 text-sm text-muted-foreground">No categories selected.</p>
        <ul className="min-w-0 space-y-2 text-sm">
          {all.map((r, i) => (
            <li key={`${r.key}-${i}`} className="flex min-w-0 items-center gap-2">
              <input type="checkbox" className="cursor-pointer" checked={false} onChange={() => onToggle?.(r.key)} />
              <span className="min-w-0 truncate text-muted-foreground">{formatLegendLabel(r.key)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <>
    <div className={cn("donut-row", size === "large" && "donut-row-large", className)}>
    <div className="donut">
        <ResponsiveContainer width="100%" height="100%">
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
                <Cell key={`${r.key}-${i}`} fill={colorAt(r.key)} stroke="none" />
              ))}
            </Pie>
            <Tooltip content={<DonutTip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
    </div>
      <ul className="legend">
        {all.map((r, i) => {
          const on = selected == null || selected.has(r.key);
          const label = formatLegendLabel(r.key);
          return (
            <li
              key={`${r.key}-${i}`}
              className={cn("legend-row", selectable && "selectable")}
              style={{ "--swatch": colorAt(r.key) } as CSSProperties}
            >
              {selectable ? (
                <input
                  type="checkbox"
                  className="cursor-pointer"
                  checked={on}
                  onChange={() => onToggle?.(r.key)}
                />
              ) : null}
              <button
                type="button"
                title={[label, ...(r.members && r.members.length > 1 ? r.members : [])].join("\n")}
                onClick={() => {
                  if (onSliceClick) onSliceClick(r.key);
                  else if (r.items?.length) setOpenKey(r.key);
                }}
              >
                {hasCategoryIcon(r.key) ? <CategoryIcon category={r.key} /> : null}
                <LegendName label={label} />
              </button>
              <strong className="money">{formatMoney(r.value)}</strong>
            </li>
          );
        })}
      </ul>
    </div>
    <SliceBreakdownDialog
      open={openKey != null && Boolean(openSlice?.items?.length)}
      title={openSlice ? formatLegendLabel(openSlice.key) : ""}
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
      <div className="mb-1 text-muted-foreground">{formatLegendLabel(p.name)}</div>
      <div className="num">
        <span className="money">{formatMoney(p.value)}</span> ({formatPct(pct, 1, false)})
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

function LegendName({ label }: { label: string }) {
  const { head, holder } = splitHolder(label);
  if (!holder) {
    return <span className="min-w-0 truncate">{label}</span>;
  }
  return (
    <span className="flex min-w-0 items-baseline">
      <span className="min-w-0 truncate">{head}</span>
      <OwnerTag>{holder}</OwnerTag>
    </span>
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
      fill="#1c2838"
      fontSize="1rem"
      fontWeight={400}
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
  const [range, setRange] = useChartRange();
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
          <XAxis type="number" tick={MONEY_AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
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
        <div className="flex h-full items-center justify-end gap-1.5 overflow-hidden pr-1 text-[11px] text-muted-foreground">
          {hasCategoryIcon(label) ? <CategoryIcon category={label} className="h-3 w-3" /> : null}
          <span className="truncate" title={label}>
            {shown}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

function keepNamed(label: string) {
  return /cash.?back|rewards|rebate/i.test(label);
}

function topSlices(rows: { label: string; value: number }[], limit = 8) {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const pinned = sorted.filter((r) => keepNamed(r.label));
  const rest = sorted.filter((r) => !keepNamed(r.label));
  if (pinned.length + rest.length <= limit) return sorted;
  const room = Math.max(1, limit - 1 - pinned.length);
  const head = [...rest.slice(0, room), ...pinned].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const leftover = rest.slice(room).reduce((s, r) => s + r.value, 0);
  if (leftover > 0) head.push({ label: OTHER_CATEGORIES, value: leftover });
  return head;
}

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
  const nodes: { name: string; label: string; color: string }[] = [];
  const idx = (key: string, label: string, fixed?: string) => {
    const found = keys.indexOf(key);
    if (found >= 0) return found;
    keys.push(key);
    const color = key === "hub" ? HUB_FILL : sankeyFill(label, fixed);
    nodes.push({ name: key, label, color });
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
    links.push({ source: hub, target: idx("save:invest", TO_INVESTMENTS, INVEST_FILL), value: invest });
  }
  const saved = inTotal - outTotal - Math.max(0, invest);
  if (saved > 1) links.push({ source: hub, target: idx("save:to", TO_SAVINGS, SAVED_FILL), value: saved });
  else if (saved < -1) links.push({ source: hub, target: idx("save:from", FROM_SAVINGS, DRAWN_FILL), value: -saved });

  if (!links.length) {
    return <p className="py-10 text-sm text-muted-foreground">No cashflow in this window.</p>;
  }

  return (
    <CashflowSankeyChart
      nodes={nodes}
      links={links}
      outflows={outflows}
      sources={sources}
      onSpendClick={onSpendClick}
      onIncomeClick={onIncomeClick}
      onBalanceClick={onBalanceClick}
    />
  );
}

function CashflowSankeyChart({
  nodes,
  links,
  outflows,
  sources,
  onSpendClick,
  onIncomeClick,
  onBalanceClick,
}: {
  nodes: { name: string; label: string; color: string }[];
  links: { source: number; target: number; value: number }[];
  outflows: { label: string; value: number }[];
  sources: { label: string; value: number }[];
  onSpendClick?: (label: string) => void;
  onIncomeClick?: (label: string) => void;
  onBalanceClick?: (kind: "from-savings" | "to-savings" | "to-investments") => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const apply = () => setWidth(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Phone widths cannot spare ~250px of side labels. Draw the flows edge to edge and list names below.
  const compact = width > 0 && width < 640;
  const spendNames = new Set(outflows.map((s) => s.label));
  const incomeNames = new Set(sources.map((s) => s.label));
  const legend = nodes.filter((n) => n.name !== "hub");

  return (
    <div ref={box} className="w-full min-w-0">
      <div className={compact ? "h-80 w-full" : "h-[32rem] w-full"}>
      {width > 0 ? (
      <ResponsiveContainer>
        <Sankey
          data={{ nodes, links }}
          nameKey="name"
          nodeWidth={compact ? 10 : 12}
          nodePadding={compact ? 10 : 26}
          linkCurvature={0.5}
          iterations={16}
          margin={compact ? { left: 8, right: 8, top: 8, bottom: 8 } : { left: 132, right: 148, top: 16, bottom: 16 }}
          node={(props) => (
            <SankeyNode
              x={props.x}
              y={props.y}
              width={props.width}
              height={props.height}
              payload={props.payload}
              compact={compact}
              onSpendClick={onSpendClick}
              onIncomeClick={onIncomeClick}
              onBalanceClick={onBalanceClick}
              spendNames={spendNames}
              incomeNames={incomeNames}
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
              spendNames={spendNames}
              incomeNames={incomeNames}
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
                source?: unknown;
                target?: unknown;
              };
              const label = sankeyHoverLabel(row, entry.name);
              const value = typeof row.value === "number" ? row.value : Number(payload[0].value);
              return (
                <div className="rounded-md border border-border bg-card-elevated px-3 py-2 text-xs">
                  <div className="mb-1 text-muted-foreground">{label}</div>
                  <div className="num money">{formatMoney(value)}</div>
                </div>
              );
            }}
          />
        </Sankey>
      </ResponsiveContainer>
      ) : null}
      </div>
      {compact ? (
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {legend.map((n) => {
            const swatch = (
              <>
                <span className="size-2 shrink-0 rounded-sm" style={{ background: n.color }} />
                <span className="truncate">{n.label}</span>
              </>
            );
            if (n.label === TO_SAVINGS) {
              return (
                <li key={n.name}>
                  <div className="flex min-w-0 max-w-full items-center gap-2 text-left text-xs">{swatch}</div>
                </li>
              );
            }
            return (
            <li key={n.name}>
              <button
                type="button"
                className="flex min-w-0 max-w-full cursor-pointer items-center gap-2 text-left text-xs"
                onClick={() => {
                  if (n.label === FROM_SAVINGS) onBalanceClick?.("from-savings");
                  else if (n.label === TO_INVESTMENTS) onBalanceClick?.("to-investments");
                  else if (spendNames.has(n.label)) onSpendClick?.(n.label);
                  else if (incomeNames.has(n.label)) onIncomeClick?.(n.label);
                }}
              >
                {swatch}
              </button>
            </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function cleanSankeyText(text: string): string {
  let s = text.trim();
  s = s.replace(/^(?:hub|in|out|save)(?::(?:hub|in|out|save))?\s*[-–:]\s*/i, "");
  s = s.replace(/^(?:in|out|save|hub):/i, "");
  s = s.replace(/^Income\s*[-–:]\s*/i, "");
  s = s.replace(/^Income\s+(?=\S)/i, "");
  s = s.replace(/\s*[-–:]\s*(?:hub|income)$/i, "");
  s = s.replace(/\s+hub$/i, "");
  if (/^hub$/i.test(s)) return "Income";
  return s.trim();
}

function sankeyLabel(n: { name?: string; label?: string } | undefined | null): string {
  if (!n || typeof n !== "object") return "";
  return cleanSankeyText(String(n.label || n.name || ""));
}

function isSankeyHub(s: string): boolean {
  return !s || /^(hub|income)$/i.test(s);
}

function sankeyHoverLabel(row: { name?: string; label?: string; source?: unknown; target?: unknown }, entryName?: unknown): string {
  const src = sankeyLabel(row?.source as { name?: string; label?: string } | undefined);
  const tgt = sankeyLabel(row?.target as { name?: string; label?: string } | undefined);
  if (src && tgt) {
    if (!isSankeyHub(tgt)) return tgt;
    if (!isSankeyHub(src)) return src;
  }
  const self = sankeyLabel(row);
  if (self && !isSankeyHub(self)) return self;
  return cleanSankeyText(String(entryName ?? self ?? ""));
}

function nodeColor(n: { color?: string; name?: string; label?: string } | undefined | null): string | undefined {
  if (!n || typeof n !== "object") return undefined;
  if (n.color) return n.color;
  const label = sankeyLabel(n);
  return label ? colorFor(label) : undefined;
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
    tgtName === TO_INVESTMENTS;
  const leaf = !isSankeyHub(tgtName) ? payload?.target : payload?.source;
  const stroke = nodeColor(leaf as { color?: string; name?: string; label?: string }) ?? colorFor(tgtName || srcName);
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={Math.max(Number(linkWidth) || 2, 2)}
      strokeOpacity={0.72}
      className={clickable ? "cursor-pointer" : undefined}
      onClick={() => {
        if (tgtName === FROM_SAVINGS) onBalanceClick?.("from-savings");
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
  compact,
  onSpendClick,
  onIncomeClick,
  onBalanceClick,
  spendNames,
  incomeNames,
}: Pick<SankeyNodeProps, "x" | "y" | "width" | "height" | "payload"> & {
  compact?: boolean;
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
  const name = cleanSankeyText(rawName);
  const cx = Number(x ?? 0);
  const cy = Number(y ?? 0);
  const w = Number(width ?? 0);
  const h = Number(height ?? 0);
  const spend = Boolean(onSpendClick && spendNames?.has(name));
  const income = Boolean(onIncomeClick && incomeNames?.has(name));
  const balance = name === FROM_SAVINGS || name === TO_INVESTMENTS;
  const clickable = spend || income || balance;
  const fontSize = 13;
  const lineH = 16;
  const lines = wrapLabel(name, 15);
  const labelW = 128;
  const labelH = Math.max(h, lineH * lines.length + 4);
  const labelX = right ? cx + w + 4 : cx - 4 - labelW;
  const labelY = cy + (Math.max(h, 2) - labelH) / 2;
  const textX = right ? cx + w + 8 : cx - 8;
  const textY = cy + Math.max(h, 2) / 2 - ((lines.length - 1) * lineH) / 2;
  return (
    <g
      className={clickable ? "cursor-pointer" : undefined}
      onClick={() => {
        if (name === FROM_SAVINGS) onBalanceClick?.("from-savings");
        else if (name === TO_INVESTMENTS) onBalanceClick?.("to-investments");
        else if (spend && onSpendClick) onSpendClick(name);
        else if (income && onIncomeClick) onIncomeClick(name);
      }}
    >
      <rect
        x={cx}
        y={cy}
        width={w}
        height={Math.max(h, 2)}
        fill={nodeColor(payload as { color?: string; name?: string; label?: string }) ?? colorFor(name)}
        rx={1}
      />
      {compact || !clickable ? null : <rect x={labelX} y={labelY} width={labelW} height={labelH} fill="transparent" />}
      {compact ? null : (
      <text
        x={textX}
        y={textY}
        textAnchor={right ? "start" : "end"}
        dominantBaseline="middle"
        fill="#C9D4E3"
        fontSize={fontSize}
        fontFamily="var(--font-geist-sans)"
      >
        {lines.map((ln, i) => (
          <tspan key={i} x={textX} dy={i === 0 ? 0 : lineH}>
            {ln}
          </tspan>
        ))}
      </text>
      )}
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
            tick={MONEY_AXIS}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(v) =>
              new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)
            }
          />
          <Tooltip content={<Tip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#8fa0b8" }} />
          <Bar dataKey="value" name="Value" fill="#7EABD4" radius={[2, 2, 0, 0]} />
          <Bar dataKey="debt" name="Debt" fill="#D4928C" radius={[2, 2, 0, 0]} />
          <Bar dataKey="equity" name="Equity" fill="#7DB8A4" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
