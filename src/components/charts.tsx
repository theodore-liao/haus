"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Line,
  LineChart,
  ReferenceLine,
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
import { inRange, type RangeKey } from "@/lib/range";
import { ChartRange, Chip, ChipGroup, useChartRange } from "./chart-range";
import { Delta } from "./money";
import { SliceBreakdownDialog, type SliceItem } from "./category-merchants";
import { CategoryIcon, hasCategoryIcon } from "@/lib/category-icons";
import { colorFor, donutColorMap } from "@/lib/category-colors";
import type { CategoryChange } from "@/lib/spend-compare";
import { isOtherSlice, OTHER_CATEGORIES, TO_INVESTMENTS, TO_SAVINGS } from "@/lib/flow-labels";
import {
  sankeyLeafAction,
  sankeyLinkAction,
  sankeyShareLabel,
  sankeyShareTotal,
  sankeySideTotals,
  type SankeyLeafAction,
} from "@/lib/sankey-node";
import { SANKEY_INCOME_LIMIT, SANKEY_SPEND_LIMIT, sankeyIncomeLabel, topSlices } from "@/lib/sankey-slices";

const AXIS = { fontSize: 11, fill: "#8fa0b8", fontFamily: "var(--font-geist-sans)" };
const MONEY_AXIS = { ...AXIS, className: "money" };
const GRID = "rgba(148,163,184,0.12)";
const ICE = "#A8C5E2";
const HUB_FILL = "#8B9BB3";
const SAVED_FILL = "#6FC4B0";
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

const RANGE_SPAN: Record<RangeKey, string> = {
  "1m": "the last month",
  "3m": "the last 3 months",
  "6m": "the last 6 months",
  "1y": "the last year",
  all: "all history",
};
const ASSET_FILL = "#7DB8A4";
const DEBT_FILL = "#D4928C";

type NetWorthPoint = { date: string; netWorth: number; assets?: number; liabilities?: number };

export function NetWorthChart({
  data,
  name = "Net worth",
  empty,
  zeroBased = true,
}: {
  data: NetWorthPoint[];
  /** False fits the axis to the data, for prices and values that never approach zero. */
  zeroBased?: boolean;
  /** Series name in the tooltip. */
  name?: string;
  /** Shown when there is no history yet. */
  empty?: string;
}) {
  const [range, setRange] = useChartRange();
  const [split, setSplit] = useState(false);
  const sliced = useMemo(() => data.filter((d) => inRange(d.date, range)), [data, range]);
  if (data.length === 0) {
    return (
      <p className="py-10 text-sm text-muted-foreground">
        {empty ??
          "History is built from linked transactions, holdings marked at historical prices, and manual entries. Sync an institution or add crypto to populate this path."}
      </p>
    );
  }
  const canSplit = sliced.length > 0 && sliced.every((d) => d.assets != null && d.liabilities != null);
  const showSplit = split && canSplit;
  const first = sliced[0];
  const last = sliced[sliced.length - 1];
  const change = sliced.length >= 2 ? last.netWorth - first.netWorth : null;
  const changePct = change != null && first.netWorth > 0 ? (change / first.netWorth) * 100 : null;
  // Sub-year windows label by day so adjacent ticks never read "Aug Aug Aug".
  const tickFmt = range === "1m" || range === "3m" || range === "6m" ? "d MMM" : "MMM yyyy";
  const rows = sliced.map((d) => ({
    ...d,
    label: format(new Date(d.date), tickFmt),
  }));
  const tickEvery = Math.max(1, Math.ceil(rows.length / (range === "all" || range === "1y" ? 6 : 8)));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="min-w-0 text-sm text-muted-foreground">
          <Delta value={change} pct={changePct} className="text-sm" /> over {RANGE_SPAN[range]}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {canSplit ? (
            <ChipGroup>
              <Chip active={!showSplit} onClick={() => setSplit(false)}>
                Net
              </Chip>
              <Chip active={showSplit} onClick={() => setSplit(true)}>
                Split
              </Chip>
            </ChipGroup>
          ) : null}
          <ChartRange value={range} onChange={setRange} />
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5E97D8" stopOpacity={0.5} />
                <stop offset="75%" stopColor="#5E97D8" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#5E97D8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="nw-assets" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ASSET_FILL} stopOpacity={0.32} />
                <stop offset="100%" stopColor={ASSET_FILL} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="nw-debt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={DEBT_FILL} stopOpacity={0.32} />
                <stop offset="100%" stopColor={DEBT_FILL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={tickEvery - 1} minTickGap={28} />
            <YAxis
              tick={MONEY_AXIS}
              axisLine={false}
              tickLine={false}
              width={72}
              domain={zeroBased ? undefined : ["auto", "auto"]}
              tickFormatter={(v) =>
                new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)
              }
            />
            <Tooltip content={<Tip />} />
            {showSplit ? (
              <>
                <Area type="monotone" dataKey="assets" name="Assets" stroke={ASSET_FILL} fill="url(#nw-assets)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="liabilities" name="Liabilities" stroke={DEBT_FILL} fill="url(#nw-debt)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="netWorth" name="Net worth" stroke={ICE} fill="none" strokeWidth={2} />
              </>
            ) : (
              <Area type="monotone" dataKey="netWorth" name={name} stroke="#9CC4EE" fill="url(#nw)" strokeWidth={2.25} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {showSplit ? (
        <div className="footnote mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          <LegendKey color={ASSET_FILL} label="Assets" />
          <LegendKey color={DEBT_FILL} label="Liabilities" />
          <LegendKey color={ICE} label="Net worth" />
        </div>
      ) : null}
    </div>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Month-by-month savings rate. Rates are fractions (0.25 = 25%). */
export function SavingsRateTrend({ data }: { data: { label: string; rate: number }[] }) {
  const rows = data.map((d) => ({ label: d.label, pct: Math.round(d.rate * 1000) / 10 }));
  return (
    <div className="h-28 w-full">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${v}%`} />
          <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-md border border-border bg-card-elevated px-3 py-2 text-xs">
                  <div className="mb-1 text-muted-foreground">{label}</div>
                  <div className="num">Savings rate {formatPct(Number(payload[0].value), 0, true)}</div>
                </div>
              ) : null
            }
          />
          <Line type="monotone" dataKey="pct" name="Savings rate" stroke={SAVED_FILL} strokeWidth={2} dot={{ r: 2.5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export type AllocSlice = { key: string; value: number; members?: string[]; items?: SliceItem[] };

/**
 * Shifts its content by the fraction of a pixel the layout left it on, so a ring's edges land on whole pixels and
 * stay crisp instead of being smeared across two.
 */
function PixelSnap({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const snap = () => {
      const r = parent.getBoundingClientRect();
      const dx = Math.round(r.left) - r.left;
      const dy = Math.round(r.top) - r.top;
      el.style.transform = dx || dy ? `translate(${dx.toFixed(3)}px, ${dy.toFixed(3)}px)` : "";
    };
    snap();
    const ro = new ResizeObserver(snap);
    ro.observe(parent);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}

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
  changes,
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
  /** Optional change per slice against an earlier period, shown beside each amount (Spending). */
  changes?: Map<string, CategoryChange> | null;
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
      <PixelSnap>
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
              paddingAngle={1.6}
              cornerRadius={4}
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
      </PixelSnap>
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
              {changes ? (
                <span className="legend-amount">
                  <LegendChange change={changes.get(r.key)} />
                  <strong className="money">{formatMoney(r.value)}</strong>
                </span>
              ) : (
                <strong className="money">{formatMoney(r.value)}</strong>
              )}
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

/** Spending up is shown as a loss, spending down as a gain. */
function LegendChange({ change }: { change: CategoryChange | undefined }) {
  if (change === undefined) return <span className="legend-change" />;
  if (change === "new") return <span className="legend-change text-muted-foreground">new</span>;
  const pct = Math.round(change * 100);
  return (
    <span className={cn("legend-change", pct > 0 ? "text-negative" : pct < 0 ? "text-positive" : "text-muted-foreground")}>
      {pct === 0 ? "0%" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`}
    </span>
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
  onBalanceClick?: (kind: "to-savings" | "to-investments") => void;
}) {
  const sources = topSlices(income, SANKEY_INCOME_LIMIT).map((r) => ({
    ...r,
    label: sankeyIncomeLabel(r.label),
  }));
  const outflows = topSlices(spend, SANKEY_SPEND_LIMIT);
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
  const saved = inTotal - outTotal - Math.max(0, invest);
  // The right side runs largest first, with the Other bucket kept last.
  const right: { key: string; label: string; value: number; fill?: string }[] = outflows.map((s) => ({
    key: `out:${s.label}`,
    label: s.label,
    value: s.value,
  }));
  const place = (row: (typeof right)[number]) => {
    const tail = right.at(-1)?.label === OTHER_CATEGORIES ? right.length - 1 : right.length;
    const at = right.slice(0, tail).findIndex((r) => r.value < row.value);
    right.splice(at < 0 ? tail : at, 0, row);
  };
  if (invest >= 1 && Number.isFinite(invest)) place({ key: "save:invest", label: TO_INVESTMENTS, value: invest, fill: INVEST_FILL });
  if (saved > 1) place({ key: "save:to", label: TO_SAVINGS, value: saved, fill: SAVED_FILL });
  for (const s of right) {
    if (!(s.value >= 1) || !Number.isFinite(s.value)) continue;
    links.push({ source: hub, target: idx(s.key, s.label, s.fill), value: s.value });
  }

  if (!links.length) {
    return <p className="py-10 text-sm text-muted-foreground">No cashflow in this window.</p>;
  }

  return (
    <CashflowSankeyChart
      nodes={nodes}
      links={links}
      onSpendClick={onSpendClick}
      onIncomeClick={onIncomeClick}
      onBalanceClick={onBalanceClick}
    />
  );
}

function CashflowSankeyChart({
  nodes,
  links,
  onSpendClick,
  onIncomeClick,
  onBalanceClick,
}: {
  nodes: { name: string; label: string; color: string }[];
  links: { source: number; target: number; value: number }[];
  onSpendClick?: (label: string) => void;
  onIncomeClick?: (label: string) => void;
  onBalanceClick?: (kind: "to-savings" | "to-investments") => void;
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
  const { inflow: inflowTotal, outflow: outflowTotal } = sankeySideTotals(nodes, links);
  const handlers = { onSpendClick, onIncomeClick, onBalanceClick };
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
          margin={compact ? { left: 8, right: 8, top: 8, bottom: 8 } : { left: 156, right: 176, top: 16, bottom: 16 }}
          style={{ overflow: "visible" }}
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
              inflowTotal={inflowTotal}
              outflowTotal={outflowTotal}
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
            />
          )}
        />
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
            const action = sankeyLeafAction(n.name, n.label);
            if (!action) {
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
                onClick={() => runSankeyAction(action, handlers)}
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

function nodeColor(n: { color?: string; name?: string; label?: string } | undefined | null): string | undefined {
  if (!n || typeof n !== "object") return undefined;
  if (n.color) return n.color;
  const label = sankeyLabel(n);
  return label ? colorFor(label) : undefined;
}

function runSankeyAction(
  action: SankeyLeafAction | null,
  handlers: {
    onSpendClick?: (label: string) => void;
    onIncomeClick?: (label: string) => void;
    onBalanceClick?: (kind: "to-savings" | "to-investments") => void;
  },
) {
  if (!action) return;
  if (action.type === "income") handlers.onIncomeClick?.(action.label);
  else if (action.type === "spend") handlers.onSpendClick?.(action.label);
  else handlers.onBalanceClick?.(action.kind);
}

function sankeyOpens(
  action: SankeyLeafAction | null,
  handlers: {
    onSpendClick?: (label: string) => void;
    onIncomeClick?: (label: string) => void;
    onBalanceClick?: (kind: "to-savings" | "to-investments") => void;
  },
) {
  if (!action) return false;
  if (action.type === "income") return Boolean(handlers.onIncomeClick);
  if (action.type === "spend") return Boolean(handlers.onSpendClick);
  return Boolean(handlers.onBalanceClick);
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
}: Pick<
  SankeyLinkProps,
  "sourceX" | "targetX" | "sourceY" | "targetY" | "sourceControlX" | "targetControlX" | "linkWidth" | "payload"
> & {
  onSpendClick?: (label: string) => void;
  onIncomeClick?: (label: string) => void;
  onBalanceClick?: (kind: "to-savings" | "to-investments") => void;
}) {
  const source = payload?.source as { name?: string; label?: string } | undefined;
  const target = payload?.target as { name?: string; label?: string } | undefined;
  const srcName = sankeyLabel(source);
  const tgtName = sankeyLabel(target);
  const handlers = { onSpendClick, onIncomeClick, onBalanceClick };
  const action = sankeyLinkAction(String(source?.name ?? ""), source?.label || srcName, String(target?.name ?? ""), target?.label || tgtName);
  const clickable = sankeyOpens(action, handlers);
  const d = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  const leaf = !isSankeyHub(tgtName) ? payload?.target : payload?.source;
  const stroke = nodeColor(leaf as { color?: string; name?: string; label?: string }) ?? colorFor(tgtName || srcName);
  // Each flow is palest at the Income hub and full color at its own category, so the hub reads as a hand-off point.
  const hubAtStart = leaf === payload?.target;
  const id = `sk-${(srcName + "-" + tgtName).replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={sourceX} x2={targetX} y1={0} y2={0}>
          <stop offset="0%" stopColor={stroke} stopOpacity={hubAtStart ? 0.38 : 0.85} />
          <stop offset="100%" stopColor={stroke} stopOpacity={hubAtStart ? 0.85 : 0.38} />
        </linearGradient>
      </defs>
    <path
      d={d}
      fill="none"
      stroke={`url(#${id})`}
      strokeWidth={Math.max(Number(linkWidth) || 2, 2)}
      className={cn("sankey-link", clickable ? "cursor-pointer" : undefined)}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? (tgtName && !isSankeyHub(tgtName) ? tgtName : srcName) : undefined}
      onClick={() => runSankeyAction(action, handlers)}
      onKeyDown={(e) => {
        if (!clickable || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        runSankeyAction(action, handlers);
      }}
    />
    </>
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
  inflowTotal,
  outflowTotal,
}: Pick<SankeyNodeProps, "x" | "y" | "width" | "height" | "payload"> & {
  compact?: boolean;
  onSpendClick?: (label: string) => void;
  onIncomeClick?: (label: string) => void;
  onBalanceClick?: (kind: "to-savings" | "to-investments") => void;
  inflowTotal: number;
  outflowTotal: number;
}) {
  const node = payload as {
    name?: string;
    label?: string;
    value?: number;
    targetNodes?: number[];
    sourceNodes?: number[];
  };
  const key = String(node?.name ?? "");
  const outgoing = (node?.targetNodes ?? []).length > 0;
  const incoming = (node?.sourceNodes ?? []).length > 0;
  const right = incoming && !outgoing;
  const name = cleanSankeyText(String(node?.label || key));
  const handlers = { onSpendClick, onIncomeClick, onBalanceClick };
  const action = sankeyLeafAction(key, name);
  const clickable = sankeyOpens(action, handlers);
  const cx = Number(x ?? 0);
  const cy = Number(y ?? 0);
  const w = Number(width ?? 0);
  const h = Number(height ?? 0);
  const value = Number(node?.value) || 0;
  const share = sankeyShareLabel(value, sankeyShareTotal(key, inflowTotal, outflowTotal));
  const hub = key === "hub";
  const amount = formatMoney(value);
  const shareX = right ? cx - 8 : cx + w + 8;
  const lineH = 18;
  const lines = wrapLabel(hub ? "" : name, 14);
  const labelW = 148;
  const labelH = Math.max(h, lineH * lines.length + 4);
  const labelX = right ? cx + w + 4 : cx - 4 - labelW;
  const labelY = cy + (Math.max(h, 2) - labelH) / 2;
  const textX = right ? cx + w + 8 : cx - 8;
  const textY = cy + Math.max(h, 2) / 2 - ((lines.length - 1) * lineH) / 2;
  return (
    <g
      className={clickable ? "cursor-pointer" : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${name}, ${amount}${share ? ` (${share})` : ""}` : undefined}
      onClick={() => runSankeyAction(action, handlers)}
      onKeyDown={(e) => {
        if (!clickable || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        runSankeyAction(action, handlers);
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
      {compact || hub || !clickable ? null : <rect x={labelX} y={labelY} width={labelW} height={labelH} fill="transparent" />}
      {compact || hub ? null : (
      <text
        className="sankey-label"
        x={textX}
        y={textY}
        textAnchor={right ? "start" : "end"}
        dominantBaseline="middle"
      >
        {lines.map((ln, i) => (
          <tspan key={i} x={textX} dy={i === 0 ? 0 : lineH}>
            {ln}
          </tspan>
        ))}
      </text>
      )}
      {hub || !(value > 0) ? null : (
        <text
          className="sankey-label"
          x={shareX}
          y={cy + Math.max(h, 2) / 2}
          textAnchor={right ? "end" : "start"}
          dominantBaseline="middle"
        >
          <tspan className="money">{amount}</tspan>
          {share ? <tspan>{` (${share})`}</tspan> : null}
        </text>
      )}
    </g>
  );
}

function wrapLabel(name: string, width = 13): string[] {
  if (name.length <= width) return [name];
  // A slash is a break point too, so "savings/investments" splits after the slash, not mid-word.
  const words = name.split(/\s+/).flatMap((w) => (w.length > width && w.includes("/") ? w.split(/(?<=\/)/) : [w]));
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
