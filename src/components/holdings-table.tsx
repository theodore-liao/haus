"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Money, Delta } from "./money";
import { formatHoldingClass, formatPct } from "@/lib/format";
import { DiscreteFilter, nextSortDir, ResetFilters, SortMark, type SortDir } from "./excel-filter";
import { BrandLabel } from "./brand-mark";
import type { BrandKind } from "@/lib/logos";
import { RemoveCrypto } from "./add-crypto";
import { AllocationChart } from "./charts";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { cn } from "@/lib/utils";

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
  accounts?: string[];
  brandKind?: BrandKind;
};

type SortKey = "symbol" | "name" | "class" | "account" | "ownerLabel" | "qty" | "last" | "value" | "costBasis" | "dayPl" | "totalPl" | "weight";

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
  headerAction,
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
  headerAction?: ReactNode;
  minValue?: number;
}) {
  const material = useMemo(() => rows.filter((r) => Math.abs(r.value) >= minValue), [rows, minValue]);
  const tableMaterial = useMemo(
    () => (tableRows ?? rows).filter((r) => Math.abs(r.value) >= minValue),
    [tableRows, rows, minValue],
  );
  const [classSel, setClassSel] = useState<Set<string> | null>(null);
  const [acctSel, setAcctSel] = useState<Set<string> | null>(null);
  const [ownerSel, setOwnerSel] = useState<Set<string> | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "value", dir: "desc" });

  const classOpts = useMemo(() => [...new Set(tableMaterial.map((r) => r.class || "other"))].sort(), [tableMaterial]);
  const acctOpts = useMemo(() => [...new Set(tableMaterial.map((r) => r.account))].sort(), [tableMaterial]);
  const ownerOpts = useMemo(() => [...new Set(tableMaterial.map((r) => r.ownerLabel))].sort(), [tableMaterial]);

  const visible = useMemo(() => {
    let list = tableMaterial.filter((r) => {
      if (classSel && !classSel.has(r.class || "other")) return false;
      if (acctSel && !acctSel.has(r.account)) return false;
      if (ownerSel && !ownerSel.has(r.ownerLabel)) return false;
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
  }, [tableMaterial, classSel, acctSel, ownerSel, sort]);

  const total = material.reduce((s, r) => s + r.value, 0);
  const byClass =
    classMode === "asset"
      ? rollupByAsset(material, minValue)
      : rollup(material, (r) => formatHoldingClass(r.class || "other"), undefined, minValue);
  const byAccount = rollup(material, (r) => r.account, (r) => r.accounts ?? [r.account], minValue);
  const byOwner = rollup(material, (r) => r.ownerLabel, undefined, minValue);
  const filtersOn = classSel != null || acctSel != null || ownerSel != null;

  function head(key: SortKey, label: string, extra?: ReactNode, right?: boolean) {
    const active = sort.key === key;
    return (
      <TableHead
        className={cn("cursor-pointer overflow-hidden", right && "text-right")}
        onClick={() =>
          setSort((s) => ({
            key,
            dir: s.key === key ? nextSortDir(s.dir) : "asc",
          }))
        }
      >
        <span className={cn("inline-flex max-w-full items-center gap-1", right && "w-full justify-end")}>
          <span className="truncate">{label}</span>
          {active ? <SortMark dir={sort.dir} /> : null}
          {extra}
        </span>
      </TableHead>
    );
  }

  return (
    <>
      {hideHero ? null : (
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">Market value</div>
            <div className="text-3xl font-medium font-mono tabular-nums">
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(total)}
            </div>
          </div>
        </div>
      )}
      {hideDonuts ? null : accountOnly ? (
      <div className="relative z-0 mb-4 grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>By account</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationChart data={byAccount} />
          </CardContent>
        </Card>
        {besideAccount}
      </div>
      ) : (
      <div className="relative z-0 mb-0 grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{classMode === "asset" ? "By asset" : "By class"}</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationChart data={byClass} />
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>By account</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationChart data={byAccount} />
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>By account holder</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationChart data={byOwner} />
          </CardContent>
        </Card>
      </div>
      )}
      {beforeTable ? <div className={cn("relative z-0", !hideDonuts && "mt-6")}>{beforeTable}</div> : null}
      {hideTable ? null : (
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Holdings</CardTitle>
          <div className="flex items-center gap-2">
            {headerAction}
          <ResetFilters
            dirty={filtersOn}
            onReset={() => {
              setClassSel(null);
              setAcctSel(null);
              setOwnerSel(null);
            }}
          />
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table className="table-fixed" containerClassName="max-h-[min(28rem,calc(100dvh-18rem))] overscroll-contain">
            <colgroup>
              <col key="c0" className="w-[8%]" />
              <col key="c1" className="w-[16%]" />
              <col key="c2" className="w-[8%]" />
              <col key="c3" className="w-[16%]" />
              <col key="c4" className="w-[8%]" />
              <col key="c5" className="w-[7%]" />
              <col key="c6" className="w-[8%]" />
              <col key="c7" className="w-[8%]" />
              <col key="c8" className="w-[7%]" />
              <col key="c9" className="w-[7%]" />
              <col key="c10" className="w-[7%]" />
              <col key="c11" className="w-[5%]" />
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-card [&_th]:bg-card">
              <TableRow>
                {head("symbol", "Symbol")}
                {head("name", "Name")}
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
                {head(
                  "ownerLabel",
                  "Holder",
                  <DiscreteFilter label="Holder" options={ownerOpts} selected={ownerSel} onChange={setOwnerSel} />,
                )}
                {head("qty", "Qty", undefined, true)}
                {head("last", "Last", undefined, true)}
                {head("value", "Value", undefined, true)}
                {head("costBasis", "Cost", undefined, true)}
                {head("dayPl", "Day", undefined, true)}
                {head("totalPl", "Total", undefined, true)}
                {head("weight", "Wt", undefined, true)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                    No holdings match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((r) => (
                  <TableRow
                    key={`${r.id}:${r.symbol ?? ""}:${r.account}`}
                    className={cn(r.manual && "bg-secondary/40")}
                  >
                    <ClipCell title={r.symbol ?? undefined}>
                      {r.symbol ? (
                        <Link href={`/investments/${encodeURIComponent(r.symbol)}`} className="block min-w-0 text-primary">
                          <BrandLabel
                            className="w-full"
                            kind={r.class === "crypto" ? "crypto" : "security"}
                            symbol={r.symbol}
                            name={r.name}
                          >
                            {r.symbol}
                          </BrandLabel>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </ClipCell>
                    <ClipCell title={r.name}>
                      <BrandLabel
                        className="w-full"
                        kind={r.class === "crypto" ? "crypto" : "security"}
                        symbol={r.symbol}
                        name={r.name}
                      >
                        {r.name}
                      </BrandLabel>
                    </ClipCell>
                    <ClipCell className="text-muted-foreground" title={r.class ?? undefined}>
                      {formatHoldingClass(r.class)}
                    </ClipCell>
                    <ClipCell title={r.account}>
                      <span className="flex min-w-0 items-center gap-1">
                        <BrandLabel className="min-w-0 flex-1" kind="institution" name={r.institution ?? r.account}>
                          {r.account}
                        </BrandLabel>
                        {r.manual ? <RemoveCrypto id={r.id} /> : null}
                      </span>
                    </ClipCell>
                    <ClipCell title={r.ownerLabel}>{r.ownerLabel}</ClipCell>
                    <ClipCell right title={String(r.qty)}>
                      {formatQty(r.qty)}
                    </ClipCell>
                    <ClipCell right>
                      <Money value={r.last} />
                    </ClipCell>
                    <ClipCell right>
                      <Money value={r.value} />
                    </ClipCell>
                    <ClipCell right>
                      <Money value={r.costBasis} />
                    </ClipCell>
                    <ClipCell right title={r.dayPl != null ? String(r.dayPl) : undefined}>
                      <Delta value={r.dayPl} />
                    </ClipCell>
                    <ClipCell right>
                      <Delta value={r.totalPl} />
                    </ClipCell>
                    <ClipCell right>{formatPct(r.weight * 100, 1, false)}</ClipCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}
    </>
  );
}

function ClipCell({
  children,
  right,
  title,
  className,
}: {
  children: ReactNode;
  right?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <TableCell
      title={title}
      className={cn(
        "max-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
        right && "text-right font-mono tabular-nums",
        className,
      )}
    >
      {children}
    </TableCell>
  );
}

function formatQty(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : 6 });
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
          kind:
            h.brandKind ??
            (h.class === "crypto" || h.class === "cryptocurrency" ? "crypto" : "security"),
        }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);
}

function rollupByAsset(rows: HoldingRow[], minItem = 10) {
  type Agg = { value: number; symbol: string | null; name: string; items: HoldingRow[] };
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const symbol = r.symbol?.trim() || null;
    const key = (symbol || r.name).trim().toUpperCase() || r.id;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { value: r.value, symbol, name: r.name, items: [r] });
      continue;
    }
    cur.value += r.value;
    cur.items.push(r);
    if (!cur.symbol && symbol) cur.symbol = symbol;
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
