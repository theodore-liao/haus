"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { formatDate } from "@/lib/format";
import { categoryLabel } from "@/lib/constants";
import { HAUS_CATEGORIES } from "@/lib/categories";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  AmountFilter,
  DateFilter,
  DiscreteFilter,
  ResetFilters,
  amountPasses,
  dateMonthKey,
  emptyAmountRule,
  type AmountRule,
} from "@/components/excel-filter";
import { BrandLabel } from "@/components/brand-mark";
import { CategoryIcon, CategoryName } from "@/lib/category-icons";
import { ArrowDown, ArrowUp } from "lucide-react";

export type TxnRow = {
  id: string;
  date: string;
  name: string;
  merchant: string;
  rawMerchant: string | null;
  account: string;
  accountMask: string | null;
  institution: string | null;
  owner: string;
  ownerLabel: string;
  category: string | null;
  categoryDetailed: string | null;
  amount: number;
  pending: boolean;
  isTransfer: boolean;
  isCcPayment: boolean;
  /** True when the row is excluded from spending. */
  internal: boolean;
  /** Set when this row was paired with the same amount on another linked account. */
  cardMatch: "matched" | null;
};

function CardMatchNote({ match }: { match: TxnRow["cardMatch"] }) {
  if (match !== "matched") return null;
  return <span className="block text-xs font-normal text-muted-foreground">Matches another account</span>;
}

function merchantGroup(r: TxnRow) {
  return r.cardMatch === "matched" ? `${r.merchant} · matches another account` : r.merchant;
}

/** Rows rendered at once. Sorting and filtering still run over the full set; only the DOM is capped. */
const PAGE = 250;

export function TransactionsTable({ rows }: { rows: TxnRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [merchantSel, setMerchantSel] = useState<Set<string> | null>(null);
  const [accountSel, setAccountSel] = useState<Set<string> | null>(null);
  const [ownerSel, setOwnerSel] = useState<Set<string> | null>(null);
  const [catSel, setCatSel] = useState<Set<string> | null>(null);
  const [amountRule, setAmountRule] = useState<AmountRule>(emptyAmountRule());
  const [dateSel, setDateSel] = useState<Set<string> | null>(null);
  const [open, setOpen] = useState<TxnRow | null>(null);
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const [applyAll, setApplyAll] = useState(true);

  function edit(t: TxnRow) {
    setOpen(t);
    setMerchant(t.merchant);
    setCategory(t.category ?? "");
    setApplyAll(true);
  }

  const merchantOpts = useMemo(() => [...new Set(rows.map((r) => merchantGroup(r)))].sort(), [rows]);
  const accountOpts = useMemo(() => [...new Set(rows.map((r) => r.account))].sort(), [rows]);
  const ownerOpts = useMemo(() => [...new Set(rows.map((r) => r.ownerLabel))].sort(), [rows]);
  const catOpts = useMemo(
    () => [...new Set(rows.map((r) => categoryLabel(r.category)))].sort(),
    [rows],
  );
  const dateOpts = useMemo(() => rows.map((r) => r.date), [rows]);
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (dateSel && !dateSel.has(dateMonthKey(r.date))) return false;
      if (merchantSel && !merchantSel.has(merchantGroup(r))) return false;
      if (accountSel && !accountSel.has(r.account)) return false;
      if (ownerSel && !ownerSel.has(r.ownerLabel)) return false;
      if (catSel && !catSel.has(categoryLabel(r.category))) return false;
      if (!amountPasses(-r.amount, amountRule)) return false;
      return true;
    });
  }, [rows, dateSel, merchantSel, accountSel, ownerSel, catSel, amountRule]);

  const columns = useMemo<ColumnDef<TxnRow>[]>(
    () => [
      {
        accessorKey: "date",
        header: () => (
          <span className="inline-flex items-center">
            Date
            <DateFilter dates={dateOpts} selected={dateSel} onChange={setDateSel} />
          </span>
        ),
        cell: ({ getValue }) => (
          <span className="num whitespace-nowrap text-muted-foreground">{formatDate(getValue() as string)}</span>
        ),
      },
      {
        accessorKey: "merchant",
        header: () => (
          <span className="inline-flex items-center">
            Merchant
            <DiscreteFilter
              label="Merchant"
              options={merchantOpts}
              selected={merchantSel}
              onChange={setMerchantSel}
              kind="merchant"
            />
          </span>
        ),
        cell: ({ row }) => (
          <BrandLabel kind="merchant" name={row.original.merchant}>
            <span className="block truncate">{row.original.merchant}</span>
            <CardMatchNote match={row.original.cardMatch} />
          </BrandLabel>
        ),
      },
      {
        accessorKey: "account",
        header: () => (
          <span className="inline-flex items-center">
            Account
            <DiscreteFilter
              label="Account"
              options={accountOpts}
              selected={accountSel}
              onChange={setAccountSel}
              kind="institution"
            />
          </span>
        ),
        cell: ({ row }) => (
          <BrandLabel kind="institution" name={row.original.institution ?? row.original.account}>
            {row.original.account}
            {row.original.accountMask ? (
              <span className="text-muted-foreground"> · {row.original.accountMask}</span>
            ) : null}
          </BrandLabel>
        ),
      },
      {
        accessorKey: "ownerLabel",
        header: () => (
          <span className="inline-flex items-center">
            Holder
            <DiscreteFilter label="Holder" options={ownerOpts} selected={ownerSel} onChange={setOwnerSel} />
          </span>
        ),
      },
      {
        accessorKey: "category",
        header: () => (
          <span className="inline-flex items-center">
            Category
            <DiscreteFilter label="Category" options={catOpts} selected={catSel} onChange={setCatSel} />
          </span>
        ),
        cell: ({ row }) => <CategoryName category={row.original.category} />,
      },
      {
        accessorKey: "amount",
        header: () => (
          <span className="inline-flex items-center justify-end">
            Amount
            <AmountFilter rule={amountRule} onChange={setAmountRule} />
          </span>
        ),
        cell: ({ row }) => (
          <span className="inline-flex items-center justify-end gap-2">
            {row.original.pending ? <Badge tone="accent">pending</Badge> : null}
            <Money value={-row.original.amount} signed={row.original.amount < 0} />
          </span>
        ),
      },
    ],
    [dateOpts, dateSel, merchantOpts, merchantSel, accountOpts, accountSel, ownerOpts, ownerSel, catOpts, catSel, amountRule],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, globalFilter: q },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQ,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableSortingRemoval: true,
    sortDescFirst: false,
  });

  async function save() {
    if (!open) return;
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        id: open.id,
        userMerchant: merchant || null,
        userCategory: category || null,
        applyToMerchant: applyAll,
      }),
    });
    if (!res.ok) toast.error("Could not save.");
    else {
      toast.success("Saved.");
      setOpen(null);
      router.refresh();
    }
  }

  return (
    <>
      <div className="section-head">
        <Input
          placeholder="Search merchant, account, category"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <span className="footnote num ml-auto">{filteredRows.length.toLocaleString("en-US")} rows</span>
        <ResetFilters
          dirty={
            Boolean(q) ||
            dateSel != null ||
            merchantSel != null ||
            accountSel != null ||
            ownerSel != null ||
            catSel != null ||
            amountRule.op !== "any"
          }
          onReset={() => {
            setQ("");
            setDateSel(null);
            setMerchantSel(null);
            setAccountSel(null);
            setOwnerSel(null);
            setCatSel(null);
            setAmountRule(emptyAmountRule());
          }}
        />
      </div>
      {/* Phones get a two-line list; the wide table needs a desktop. Same rows, same sort, same edit sheet. */}
      <div className="rounded-[var(--radius-card)] border border-border bg-card md:hidden">
        {table.getRowModel().rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No transactions match this filter.</p>
        ) : (
          <ul>
            {table.getRowModel().rows.slice(0, limit).map((row) => {
              const t = row.original;
              return (
                <li key={row.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => edit(t)}
                  >
                    <div className="min-w-0 flex-1">
                      <BrandLabel kind="merchant" name={t.merchant}>
                        <span className="truncate text-sm">{t.merchant}</span>
                        <CardMatchNote match={t.cardMatch} />
                      </BrandLabel>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        <span className="num">{formatDate(t.date)}</span> · {categoryLabel(t.category)} · {t.account}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {t.pending ? <Badge tone="accent">pending</Badge> : null}
                      <Money value={-t.amount} signed={t.amount < 0} className="text-sm" />
                    </div>
                  </button>
                </li>
              );
            })}
            {table.getRowModel().rows.length > limit ? (
              <li className="py-3 text-center">
                <Button type="button" variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                  Show {Math.min(PAGE, table.getRowModel().rows.length - limit).toLocaleString("en-US")} more
                </Button>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <div className="hidden rounded-[var(--radius-card)] border border-border bg-card md:block">
        <Table
          className="table-fixed min-w-[54rem]"
          containerClassName="max-h-[calc(100dvh-17rem)] overscroll-contain md:max-h-[calc(100dvh-14.5rem)]"
        >
          <colgroup>
            <col className="w-[7.5rem]" />
            <col className="w-auto" />
            <col className="w-auto" />
            <col className="w-[6rem]" />
            <col className="w-[11rem]" />
            <col className="w-[9rem]" />
          </colgroup>
          <TableHeader className="sticky top-0 z-10 bg-card [&_th]:bg-card">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className={h.column.id === "amount" ? "num cursor-pointer" : "cursor-pointer"}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "desc" ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : h.column.getIsSorted() === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : null}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No transactions match this filter.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.slice(0, limit).map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => edit(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cell.column.id === "amount" ? "num" : "overflow-hidden text-ellipsis whitespace-nowrap"}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
            {table.getRowModel().rows.length > limit ? (
              <TableRow>
                <TableCell colSpan={6} className="py-3 text-center">
                  <Button type="button" variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                    Show {Math.min(PAGE, table.getRowModel().rows.length - limit).toLocaleString("en-US")} more of{" "}
                    {(table.getRowModel().rows.length - limit).toLocaleString("en-US")} remaining
                  </Button>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="overflow-y-auto">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.merchant}</SheetTitle>
                <SheetDescription>
                  {formatDate(open.date)} · {open.account} · {open.institution}
                  {open.cardMatch === "matched" ? " · Matches another account" : ""}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                <div>
                  <div className="kicker">Amount</div>
                  <Money value={-open.amount} signed={open.amount < 0} className="text-lg" />
                </div>
                <div>
                  <div className="kicker">Raw description</div>
                  <p className="mt-1 text-sm">{open.name}</p>
                </div>
                <div>
                  <Label>Merchant display</Label>
                  <Input className="mt-1" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Uncategorized" />
                    </SelectTrigger>
                    <SelectContent>
                      {HAUS_CATEGORIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          <span className="inline-flex items-center gap-1.5">
                            <CategoryIcon category={c.code} />
                            {c.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={applyAll} onCheckedChange={setApplyAll} />
                  Always categorize this merchant this way
                </label>
                {open.cardMatch === "matched" ? (
                  <p className="text-sm text-negative">
                    The same amount landed in another linked account, so this is marked Transfer. If you recategorize, the auto-detected Transfer will be overwritten.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={save}>Save</Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={async () => {
                      if (
                        !confirm(
                          `Hide every current and future transaction matching “${open.merchant}”? They will leave Transactions, Cashflow, and Reports.`,
                        )
                      ) {
                        return;
                      }
                      const res = await fetch("/api/transactions", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          merchant: open.merchant,
                          rawMerchant: open.rawMerchant,
                          name: open.name,
                        }),
                      });
                      if (!res.ok) toast.error("Could not hide merchant.");
                      else {
                        toast.success("Merchant hidden.");
                        setOpen(null);
                        router.refresh();
                      }
                    }}
                  >
                    Hide this merchant
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
