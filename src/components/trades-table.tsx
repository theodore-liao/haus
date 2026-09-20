"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Money } from "./money";
import { formatDate } from "@/lib/format";
import { DiscreteFilter, nextSortDir, ResetFilters, SortMark, type SortDir } from "./excel-filter";
import { BrandLabel } from "./brand-mark";

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

export function TradesTable({ rows }: { rows: Trade[] }) {
  const [typeSel, setTypeSel] = useState<Set<string> | null>(null);
  const [symSel, setSymSel] = useState<Set<string> | null>(null);
  const [acctSel, setAcctSel] = useState<Set<string> | null>(null);
  const [sort, setSort] = useState<{ key: Key; dir: SortDir }>({ key: "date", dir: null });

  const typeOpts = useMemo(
    () => [...new Set(rows.map((r) => (r.subtype ? `${r.type} · ${r.subtype}` : r.type)))].sort(),
    [rows],
  );
  const symOpts = useMemo(() => [...new Set(rows.map((r) => r.symbol ?? "—"))].sort(), [rows]);
  const acctOpts = useMemo(() => [...new Set(rows.map((r) => r.account))].sort(), [rows]);

  const visible = useMemo(() => {
    let list = rows.filter((r) => {
      const typeLabel = r.subtype ? `${r.type} · ${r.subtype}` : r.type;
      if (typeSel && !typeSel.has(typeLabel)) return false;
      if (symSel && !symSel.has(r.symbol ?? "—")) return false;
      if (acctSel && !acctSel.has(r.account)) return false;
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
  }, [rows, typeSel, symSel, acctSel, sort]);

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
    return <p className="px-[var(--space-card)] py-6 text-sm text-muted-foreground">No investment transactions in this slice.</p>;

  const filtersOn = typeSel != null || symSel != null || acctSel != null;

  return (
    <div>
    {filtersOn ? (
      <div className="flex justify-end px-[var(--space-card)] pb-2">
        <ResetFilters
          dirty={filtersOn}
          onReset={() => {
            setTypeSel(null);
            setSymSel(null);
            setAcctSel(null);
          }}
        />
      </div>
    ) : null}
    <div className="max-h-72 overflow-y-auto">
    <Table className="table-fixed min-w-[48rem]">
      <colgroup>
        <col className="w-[7.5rem]" />
        <col className="w-[9rem]" />
        <col className="w-auto" />
        <col className="w-auto" />
        <col className="w-[7rem]" />
        <col className="w-[7rem]" />
        <col className="w-[8rem]" />
      </colgroup>
      <TableHeader className="sticky top-0 z-10 bg-card [&_th]:bg-card">
        <TableRow>
          {head("date", "Date")}
          {head(
            "type",
            "Type",
            <DiscreteFilter label="Type" options={typeOpts} selected={typeSel} onChange={setTypeSel} />,
          )}
          {head(
            "symbol",
            "Symbol",
            <DiscreteFilter label="Symbol" options={symOpts} selected={symSel} onChange={setSymSel} kind="security" />,
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
    </div>
  );
}
