"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { SearchInput } from "./search-input";
import { Money } from "./money";
import { formatDate } from "@/lib/format";
import { DiscreteFilter, nextSortDir, ResetFilters, SortMark, type SortDir } from "./excel-filter";
import { BrandLabel, BrandMark } from "./brand-mark";

type Trade = {
  id: string;
  date: string;
  name: string;
  type: string;
  subtype: string | null;
  symbol: string | null;
  account: string;
  quantity: number | null;
  amount: number;
  price: number | null;
};

type Key = "date" | "type" | "symbol" | "account" | "quantity" | "price" | "amount";

export function TradesCard({ trades }: { trades: Trade[] }) {
  const [q, setQ] = useState("");
  const [typeSel, setTypeSel] = useState<Set<string> | null>(null);
  const [symSel, setSymSel] = useState<Set<string> | null>(null);
  const [acctSel, setAcctSel] = useState<Set<string> | null>(null);
  const filtersOn = typeSel != null || symSel != null || acctSel != null || q.trim() !== "";
  const tabs = [
    ["all", "All"],
    ["buy", "Buys"],
    ["sell", "Sells"],
    ["dividend", "Dividends"],
    ["cash", "Contributions / cash"],
    ["fee", "Fees"],
  ] as const;

  return (
    <Card>
      <Tabs defaultValue="all">
        <CardHeader row className="pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <CardTitle className="shrink-0">Trades</CardTitle>
            <SearchInput placeholder="Search symbol, name, account" value={q} onChange={setQ} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <TabsList>
              {tabs.map(([value, label]) => (
                <TabsTrigger key={value} value={value}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <ResetFilters
              dirty={filtersOn}
              onReset={() => {
                setTypeSel(null);
                setSymSel(null);
                setAcctSel(null);
                setQ("");
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          {tabs.map(([k]) => (
            <TabsContent key={k} value={k} className="mt-0">
              <TradesTable
                rows={trades.filter((t) => {
                  if (k === "all") return true;
                  const blob = `${t.type} ${t.subtype ?? ""}`.toLowerCase();
                  return blob.includes(k) || (k === "cash" && (blob.includes("contribution") || blob.includes("transfer")));
                })}
                q={q}
                typeSel={typeSel}
                symSel={symSel}
                acctSel={acctSel}
                onTypeSel={setTypeSel}
                onSymSel={setSymSel}
                onAcctSel={setAcctSel}
              />
            </TabsContent>
          ))}
        </CardContent>
      </Tabs>
    </Card>
  );
}

function TradesTable({
  rows,
  q,
  typeSel,
  symSel,
  acctSel,
  onTypeSel,
  onSymSel,
  onAcctSel,
}: {
  rows: Trade[];
  q: string;
  typeSel: Set<string> | null;
  symSel: Set<string> | null;
  acctSel: Set<string> | null;
  onTypeSel: (next: Set<string> | null) => void;
  onSymSel: (next: Set<string> | null) => void;
  onAcctSel: (next: Set<string> | null) => void;
}) {
  const [sort, setSort] = useState<{ key: Key; dir: SortDir }>({ key: "date", dir: null });

  const typeOpts = useMemo(
    () => [...new Set(rows.map((r) => (r.subtype ? `${r.type} · ${r.subtype}` : r.type)))].sort(),
    [rows],
  );
  const symOpts = useMemo(() => [...new Set(rows.map((r) => r.symbol ?? "—"))].sort(), [rows]);
  const acctOpts = useMemo(() => [...new Set(rows.map((r) => r.account))].sort(), [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      const typeLabel = r.subtype ? `${r.type} · ${r.subtype}` : r.type;
      if (typeSel && !typeSel.has(typeLabel)) return false;
      if (symSel && !symSel.has(r.symbol ?? "—")) return false;
      if (acctSel && !acctSel.has(r.account)) return false;
      if (needle) {
        const hay = `${r.symbol ?? ""} ${r.name} ${r.account} ${r.type} ${r.subtype ?? ""}`.toLowerCase();
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
    return list;
  }, [rows, typeSel, symSel, acctSel, q, sort]);

  function head(key: Key, label: string, extra?: ReactNode, right?: boolean) {
    return (
      <TableHead
        className={right ? "num cursor-pointer select-none" : "cursor-pointer select-none"}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? nextSortDir(s.dir) : "asc" }))}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {sort.key === key ? <SortMark dir={sort.dir} /> : null}
          {extra}
        </span>
      </TableHead>
    );
  }

  if (!rows.length)
    return <p className="px-[var(--space-card)] py-6 text-sm text-muted-foreground">No investment transactions in this view.</p>;

  return (
    <>
    {/* Phones get a compact list (what, when, where, and the amount); the seven-column table needs a wider screen. */}
    <ul className="max-h-72 overflow-y-auto md:hidden" aria-label="Trades">
      {visible.length === 0 ? (
        <li className="py-8 text-center text-sm text-muted-foreground">No trades match this filter.</li>
      ) : (
        visible.slice(0, 80).map((t) => (
          <li key={t.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
            {t.symbol ? (
              <BrandMark kind="security" symbol={t.symbol} name={t.name} size={22} />
            ) : (
              <BrandMark kind="institution" name={t.account} size={22} />
            )}
            <span className="min-w-0 flex-1">
              <span className={t.symbol ? "block truncate text-sm font-medium text-primary" : "block truncate text-sm font-medium"}>
                {t.symbol ?? t.name}
              </span>
              {/* What it was first, then when; the account only when there is more than one to tell apart. */}
              <span className="block truncate text-xs text-muted-foreground">
                {/* The more specific word ("Contribution" over "Transfer"), so the date still fits on a phone. */}
                <span className="capitalize">{t.subtype && t.subtype.toLowerCase() !== t.type.toLowerCase() ? t.subtype : t.type}</span> ·{" "}
                <span className="num">{formatDate(t.date)}</span>
                {acctOpts.length > 1 ? ` · ${t.account}` : null}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="num block text-sm">
                <Money value={t.amount} />
              </span>
              {t.quantity != null && t.price != null ? (
                <span className="num block text-xs text-muted-foreground">
                  {t.quantity} × <Money value={t.price} />
                </span>
              ) : null}
            </span>
          </li>
        ))
      )}
    </ul>
    <div className="hidden max-h-72 overflow-y-auto md:block">
    <Table className="table-fixed">
      <colgroup>
        <col className="w-[12%]" />
        <col className="w-[14%]" />
        <col className="w-[16%]" />
        <col className="w-[16%]" />
        <col className="w-[12%]" />
        <col className="w-[12%]" />
        <col className="w-[18%]" />
      </colgroup>
      <TableHeader className="sticky top-0 z-10 bg-card [&_th]:bg-card">
        <TableRow>
          {head("date", "Date")}
          {head(
            "type",
            "Type",
            <DiscreteFilter label="Type" options={typeOpts} selected={typeSel} onChange={onTypeSel} />,
          )}
          {head(
            "symbol",
            "Symbol",
            <DiscreteFilter label="Symbol" options={symOpts} selected={symSel} onChange={onSymSel} kind="security" />,
          )}
          {head(
            "account",
            "Account",
            <DiscreteFilter
              label="Account"
              options={acctOpts}
              selected={acctSel}
              onChange={onAcctSel}
              kind="institution"
            />,
          )}
          {head("quantity", "Qty", undefined, true)}
          {head("price", "Price", undefined, true)}
          {head("amount", "Amount", undefined, true)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.slice(0, 80).map((t) => (
          <TableRow key={t.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              <span className="num">{formatDate(t.date)}</span>
            </TableCell>
            <TableCell className="overflow-hidden text-ellipsis whitespace-nowrap capitalize">
              {t.type}
              {t.subtype && t.subtype.toLowerCase() !== t.type.toLowerCase() ? (
                <span className="text-muted-foreground"> · {t.subtype}</span>
              ) : null}
            </TableCell>
            <TableCell className="overflow-hidden">
              {t.symbol ? (
                <BrandLabel kind="security" symbol={t.symbol} name={t.name}>
                  {t.symbol}
                </BrandLabel>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="overflow-hidden">
              <BrandLabel kind="institution" name={t.account}>
                {t.account}
              </BrandLabel>
            </TableCell>
            <TableCell className="num">{t.quantity ?? "—"}</TableCell>
            <TableCell className="num">
              <Money value={t.price} />
            </TableCell>
            <TableCell className="num">
              <Money value={t.amount} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
    </>
  );
}
