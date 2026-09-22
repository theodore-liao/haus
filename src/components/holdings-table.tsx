"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Input } from "./ui/input";
import { Money, Delta } from "./money";
import { HeroCard } from "./hero-card";
import { ChartCard } from "./chart-card";
import { formatDateTime, formatHoldingClass, formatPct } from "@/lib/format";
import { DiscreteFilter, nextSortDir, ResetFilters, SortMark, type SortDir } from "./excel-filter";
import { BrandMark } from "./brand-mark";
import type { BrandKind } from "@/lib/logos";
import { RemoveCrypto } from "./add-crypto";
import { AllocationChart } from "./charts";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { cn } from "@/lib/utils";
import { withHolder } from "@/lib/owners";

export type HoldingRow = {
  id: string;
  symbol: string | null;
  name: string;
  class: string | null;
  account: string;
  institution: string | null;
  ownerLabel: string;
  qty: number;
  last: number | null;
  value: number;
  costBasis: number | null;
  dayPl: number | null;
  totalPl: number | null;
  dayPct: number | null;
  weight: number;
  manual: boolean;
  /** When the user last saved a manual entry. Quote refreshes do not move this. */
  updatedAt?: string | null;
  accounts?: string[];
  brandKind?: BrandKind;
  /** Preferred logo (e.g. CoinGecko image); symbol-based sources are the fallback. */
  brandSrc?: string | null;
};

type SortKey = "symbol" | "name" | "class" | "account" | "ownerLabel" | "qty" | "last" | "value" | "costBasis" | "dayPl" | "totalPl" | "weight";

function LastUpdated({ iso }: { iso?: string | null }) {
  if (!iso) return null;
  return <span className="footnote block">Last updated: {formatDateTime(iso)}</span>;
}

export function InvestmentsBoard({
  rows,
  tableRows,
  beforeTable,
  hideHero,
  hideDonuts,
  hideTable,
  classMode = "class",
  accountOnly,
  besideAccount,
  accountSlot,
  headerAction,
  onEditManual,
  hideCostTotal,
  minValue = 10,
}: {
  rows: HoldingRow[];
  tableRows?: HoldingRow[];
  beforeTable?: ReactNode;
  hideHero?: boolean;
  hideDonuts?: boolean;
  hideTable?: boolean;
  classMode?: "class" | "asset";
  accountOnly?: boolean;
  besideAccount?: ReactNode;
  /** Replaces the "By account" donut (crypto uses largest moves here). */
  accountSlot?: ReactNode;
  headerAction?: ReactNode;
  onEditManual?: (id: string) => void;
  /** Crypto holdings have no cost basis, so those two columns stay off the table. */
  hideCostTotal?: boolean;
  minValue?: number;
}) {
  const material = useMemo(() => rows.filter((r) => Math.abs(r.value) >= minValue), [rows, minValue]);
  const tableMaterial = useMemo(
    () => (tableRows ?? rows).filter((r) => Math.abs(r.value) >= minValue),
    [tableRows, rows, minValue],
  );
  const [classSel, setClassSel] = useState<Set<string> | null>(null);
  // One filter for the Account column: options are "Account - Holder", matching what the cell shows.
  const [acctSel, setAcctSel] = useState<Set<string> | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "value", dir: "desc" });

  const classOpts = useMemo(() => [...new Set(tableMaterial.map((r) => r.class || "other"))].sort(), [tableMaterial]);
  const acctOpts = useMemo(
    () => [...new Set(tableMaterial.map((r) => withHolder(r.account, r.ownerLabel)))].sort(),
    [tableMaterial],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = tableMaterial.filter((r) => {
      if (classSel && !classSel.has(r.class || "other")) return false;
      if (acctSel && !acctSel.has(withHolder(r.account, r.ownerLabel))) return false;
      if (needle) {
        const hay = `${r.symbol ?? ""} ${r.name} ${r.account} ${r.institution ?? ""} ${r.ownerLabel} ${r.class ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    if (sort.dir) {
      const dir = sort.dir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    const total = list.reduce((s, r) => s + r.value, 0);
    return list.map((r) => ({ ...r, weight: total > 0 ? r.value / total : 0 }));
  }, [tableMaterial, classSel, acctSel, q, sort]);

  const total = material.reduce((s, r) => s + r.value, 0);
  const byClass =
    classMode === "asset"
      ? rollupByAsset(material, minValue)
      : rollup(material, (r) => formatHoldingClass(r.class || "other"), undefined, minValue);
  const byAccount = rollup(
    material,
    (r) => withHolder(r.account, r.ownerLabel),
    (r) => [withHolder(r.account, r.ownerLabel)],
    minValue,
  );
  const filtersOn = classSel != null || acctSel != null || q.trim() !== "";

  function head(key: SortKey, label: string, extra?: ReactNode, right?: boolean, className?: string) {
    const active = sort.key === key;
    return (
      <TableHead
        className={cn("cursor-pointer select-none", right && "num", className)}
        onClick={() =>
          setSort((s) => ({
            key,
            dir: s.key === key ? nextSortDir(s.dir) : "asc",
          }))
        }
      >
        <span className="inline-flex max-w-full items-center gap-1">
          <span>{label}</span>
          {active ? <SortMark dir={sort.dir} /> : null}
          {extra}
        </span>
      </TableHead>
    );
  }

  function editable(id: string, children: ReactNode) {
    if (!onEditManual) return children;
    return (
      <button type="button" className="block min-w-0 max-w-full cursor-pointer text-left" onClick={() => onEditManual(id)}>
        {children}
      </button>
    );
  }

  return (
    <div className="page-stack">
      {hideHero ? null : (
        <HeroCard kicker="Market value">
          <Money value={total} />
        </HeroCard>
      )}
      {hideDonuts ? null : accountOnly ? (
      <div className="relative z-0 grid items-stretch gap-4 lg:grid-cols-2">
        <ChartCard kicker="By account">
          <AllocationChart data={byAccount} />
        </ChartCard>
        {besideAccount ? <div className="min-w-0">{besideAccount}</div> : null}
      </div>
      ) : (
      <div className="relative z-0 grid items-stretch gap-4 lg:grid-cols-2">
        <ChartCard kicker={classMode === "asset" ? "By asset" : "By class"}>
          <AllocationChart data={byClass} />
        </ChartCard>
        {accountSlot ? (
          <div className="min-w-0">{accountSlot}</div>
        ) : (
          <ChartCard kicker="By account">
            <AllocationChart data={byAccount} />
          </ChartCard>
        )}
      </div>
      )}
      {beforeTable ? <div className="relative z-0">{beforeTable}</div> : null}
      {hideTable ? null : (
      <Card>
        <CardHeader row>
          <CardTitle>Holdings</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search symbol, name, account"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 w-full text-sm sm:w-56"
            />
            {headerAction ? <div className="flex flex-wrap items-center gap-2">{headerAction}</div> : null}
            <ResetFilters
              dirty={filtersOn}
              onReset={() => {
                setClassSel(null);
                setAcctSel(null);
                setQ("");
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {/* Phones get a compact list (asset, account, value, total P/L); the ten-column table needs a desktop. */}
          <ul className="max-h-[calc(100dvh-16rem)] overflow-y-auto overscroll-contain md:hidden">
            {visible.length === 0 ? (
              <li className="py-8 text-center text-sm text-muted-foreground">No holdings match this filter.</li>
            ) : (
              visible.map((r) => {
                const brandKind = r.brandKind ?? (r.class === "crypto" ? "crypto" : "security");
                const body = (
                  <>
                    <BrandMark kind={brandKind} symbol={r.symbol} name={r.name} src={r.brandSrc} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-medium", r.symbol && !r.manual && "text-primary")}>
                        {r.symbol ?? r.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.account} · {r.ownerLabel}
                      </span>
                      {r.manual ? <LastUpdated iso={r.updatedAt} /> : null}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-sm">
                        <Money value={r.value} />
                      </span>
                      <span className="num block text-xs">
                        <Delta value={hideCostTotal ? r.dayPl : r.totalPl} />
                      </span>
                    </span>
                  </>
                );
                const rowClass = cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left",
                  r.manual && "bg-secondary/40",
                );
                return (
                  <li key={`m:${r.id}:${r.symbol ?? ""}:${r.account}`} className="border-b border-border last:border-0">
                    {r.manual && onEditManual ? (
                      <div className={rowClass}>
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onEditManual(r.id)}>
                          {body}
                        </button>
                        <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2" onClick={() => onEditManual(r.id)}>
                          Edit
                        </Button>
                      </div>
                    ) : r.symbol && !r.manual ? (
                      <Link href={`/investments/${encodeURIComponent(r.symbol)}`} className={rowClass}>
                        {body}
                      </Link>
                    ) : (
                      <div className={rowClass}>{body}</div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
          <Table
            className="hidden table-fixed min-w-[60rem] md:table"
            containerClassName="hidden max-h-[min(30rem,calc(100dvh-18rem))] overscroll-contain md:block"
          >
            <colgroup>
              {/* Text columns take what the figures leave; figures never wrap. Day P/L waits for a 2xl viewport. */}
              <col className="w-auto" />
              <col className="w-[5.25rem]" />
              <col className="w-auto" />
              <col className="w-[6rem]" />
              <col className="w-[6rem]" />
              <col className="w-[7rem]" />
              {hideCostTotal ? null : <col className="w-[6.75rem]" />}
              <col className={DAY_COL} />
              {hideCostTotal ? null : <col className="w-[7.25rem]" />}
              <col className="w-[4rem]" />
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-card [&_th]:bg-card">
              <TableRow>
                {head("symbol", "Asset")}
                {head(
                  "class",
                  "Class",
                  <DiscreteFilter label="Class" options={classOpts} selected={classSel} onChange={setClassSel} />,
                )}
                {head(
                  "account",
                  "Account",
                  <DiscreteFilter
                    label="Account"
                    options={acctOpts}
                    selected={acctSel}
                    onChange={setAcctSel}
                    kind="institution"
                  />,
                )}
                {head("qty", "Qty", undefined, true)}
                {head("last", "Last", undefined, true)}
                {head("value", "Value", undefined, true)}
                {hideCostTotal ? null : head("costBasis", "Cost", undefined, true)}
                {head("dayPl", "Day", undefined, true, DAY_CELL)}
                {hideCostTotal ? null : head("totalPl", "Total", undefined, true)}
                {head("weight", "Wt", undefined, true)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={hideCostTotal ? 8 : 10} className="py-8 text-center text-muted-foreground">
                    No holdings match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((r) => {
                  const brandKind = r.brandKind ?? (r.class === "crypto" ? "crypto" : "security");
                  const asset = (
                    <span className="flex min-w-0 items-center gap-2">
                      <BrandMark kind={brandKind} symbol={r.symbol} name={r.name} src={r.brandSrc} size={18} />
                      <span className="cell-stack">
                        <span className={cn("font-medium", r.symbol && !r.manual && "text-primary")}>
                          {r.symbol ?? r.name}
                        </span>
                        {r.symbol ? <span>{r.name}</span> : null}
                        {r.manual ? <LastUpdated iso={r.updatedAt} /> : null}
                      </span>
                    </span>
                  );
                  return (
                    <TableRow
                      key={`${r.id}:${r.symbol ?? ""}:${r.account}`}
                      className={cn(r.manual && "bg-secondary/40")}
                    >
                      <TableCell title={r.symbol ? `${r.symbol} · ${r.name}` : r.name}>
                        {r.manual ? (
                          editable(r.id, asset)
                        ) : r.symbol ? (
                          <Link href={`/investments/${encodeURIComponent(r.symbol)}`} className="block min-w-0">
                            {asset}
                          </Link>
                        ) : (
                          asset
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground" title={r.class ?? undefined}>
                        <span className="block truncate">{formatHoldingClass(r.class)}</span>
                      </TableCell>
                      <TableCell title={`${r.account} · ${r.ownerLabel}`}>
                        <span className="flex min-w-0 items-center gap-2">
                          <BrandMark kind="institution" name={r.institution ?? r.account} size={18} />
                          <span className="cell-stack flex-1">
                            <span>{r.account}</span>
                            <span>{r.ownerLabel}</span>
                          </span>
                          {r.manual && onEditManual ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 shrink-0 px-2"
                              onClick={() => onEditManual(r.id)}
                            >
                              Edit
                            </Button>
                          ) : null}
                          {r.manual ? <RemoveCrypto id={r.id} /> : null}
                        </span>
                      </TableCell>
                      <TableCell className="num" title={String(r.qty)}>
                        {formatQty(r.qty)}
                      </TableCell>
                      <TableCell className="num">
                        <Money value={r.last} />
                      </TableCell>
                      <TableCell className="num">
                        <Money value={r.value} />
                      </TableCell>
                      {hideCostTotal ? null : (
                        <TableCell className="num text-muted-foreground">
                          <Money value={r.costBasis} />
                        </TableCell>
                      )}
                      <TableCell className={cn("num", DAY_CELL)}>
                        <Delta value={r.dayPl} />
                      </TableCell>
                      {hideCostTotal ? null : (
                        <TableCell className="num">
                          <Delta value={r.totalPl} />
                        </TableCell>
                      )}
                      <TableCell className="num text-muted-foreground">{formatPct(r.weight * 100, 1, false)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}
    </div>
  );
}

// Below 2xl the Day P/L column gives its width to the Asset/Account text columns.
const DAY_COL = "hidden w-[6.25rem] 2xl:table-column";
const DAY_CELL = "hidden 2xl:table-cell";

function formatQty(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : 4 });
}

function rollup(
  rows: HoldingRow[],
  key: (r: HoldingRow) => string,
  members?: (r: HoldingRow) => string[],
  minItem = 10,
) {
  const map: Record<string, { value: number; members: Set<string>; items: HoldingRow[] }> = {};
  for (const r of rows) {
    const k = key(r);
    const row = map[k] ?? { value: 0, members: new Set<string>(), items: [] };
    row.value += r.value;
    row.items.push(r);
    for (const m of members ? members(r) : []) row.members.add(m);
    map[k] = row;
  }
  return Object.entries(map)
    .map(([k, v]) => ({
      key: k,
      value: v.value,
      members: v.members.size ? [...v.members] : undefined,
      items: v.items
        .filter((h) => Math.abs(h.value) >= minItem)
        .map((h) => ({
          label: h.symbol ? `${h.symbol} · ${h.name}` : h.name,
          value: h.value,
          symbol: h.symbol,
          name: h.name,
          src: h.brandSrc,
          kind:
            h.brandKind ??
            (h.class === "crypto" || h.class === "cryptocurrency" ? "crypto" : "security"),
        }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);
}

function rollupByAsset(rows: HoldingRow[], minItem = 10) {
  type Agg = { value: number; symbol: string | null; name: string; src: string | null; items: HoldingRow[] };
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const symbol = r.symbol?.trim() || null;
    const key = (symbol || r.name).trim().toUpperCase() || r.id;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { value: r.value, symbol, name: r.name, src: r.brandSrc ?? null, items: [r] });
      continue;
    }
    cur.value += r.value;
    cur.items.push(r);
    if (!cur.symbol && symbol) cur.symbol = symbol;
    if (!cur.src && r.brandSrc) cur.src = r.brandSrc;
    const biggest = cur.items.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a));
    cur.name = biggest.name;
  }
  const total = [...map.values()].reduce((s, v) => s + v.value, 0);
  const ranked = [...map.values()].sort((a, b) => b.value - a.value);
  const slices: {
    key: string;
    value: number;
    items: {
      label: string;
      value: number;
      symbol: string | null;
      name: string;
      src?: string | null;
      kind: BrandKind;
    }[];
  }[] = [];
  const otherItems: (typeof slices)[number]["items"] = [];
  let otherVal = 0;
  for (const v of ranked) {
    const token = {
      label: v.symbol ? `${v.symbol} · ${v.name}` : v.name,
      value: v.value,
      symbol: v.symbol,
      name: v.name,
      src: v.src,
      kind: "crypto" as const,
    };
    if (total > 0 && v.value / total < 0.01) {
      otherVal += v.value;
      otherItems.push(token);
      continue;
    }
    slices.push({
      key: v.symbol || v.name,
      value: v.value,
      items: v.items
        .filter((h) => Math.abs(h.value) >= minItem)
        .map((h) => ({
          label: h.account ? `${h.symbol ?? h.name} · ${h.account}` : h.symbol ? `${h.symbol} · ${h.name}` : h.name,
          value: h.value,
          symbol: h.symbol,
          name: h.name,
          src: h.brandSrc,
          kind: (h.brandKind ?? "crypto") as BrandKind,
        }))
        .sort((a, b) => b.value - a.value),
    });
  }
  if (otherVal > 0) {
    slices.push({
      key: "Other",
      value: otherVal,
      items: otherItems.sort((a, b) => b.value - a.value),
    });
  }
  return slices.sort((a, b) => b.value - a.value);
}
