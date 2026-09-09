"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
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
import { AmountFilter, DiscreteFilter, ResetFilters, amountPasses, emptyAmountRule, type AmountRule } from "@/components/excel-filter";
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
};

export function TransactionsTable({ rows }: { rows: TxnRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [merchantSel, setMerchantSel] = useState<Set<string> | null>(null);
  const [accountSel, setAccountSel] = useState<Set<string> | null>(null);
  const [ownerSel, setOwnerSel] = useState<Set<string> | null>(null);
  const [catSel, setCatSel] = useState<Set<string> | null>(null);
  const [amountRule, setAmountRule] = useState<AmountRule>(emptyAmountRule());
  const [open, setOpen] = useState<TxnRow | null>(null);
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const [applyAll, setApplyAll] = useState(true);

  const merchantOpts = useMemo(() => [...new Set(rows.map((r) => r.merchant))].sort(), [rows]);
  const accountOpts = useMemo(() => [...new Set(rows.map((r) => r.account))].sort(), [rows]);
  const ownerOpts = useMemo(() => [...new Set(rows.map((r) => r.ownerLabel))].sort(), [rows]);
  const catOpts = useMemo(
    () => [...new Set(rows.map((r) => categoryLabel(r.category)))].sort(),
    [rows],
  );
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (merchantSel && !merchantSel.has(r.merchant)) return false;
      if (accountSel && !accountSel.has(r.account)) return false;
      if (ownerSel && !ownerSel.has(r.ownerLabel)) return false;
      if (catSel && !catSel.has(categoryLabel(r.category))) return false;
      if (!amountPasses(-r.amount, amountRule)) return false;
      return true;
    });
  }, [rows, merchantSel, accountSel, ownerSel, catSel, amountRule]);

  const columns = useMemo<ColumnDef<TxnRow>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ getValue }) => (
          <span className="font-mono tabular-nums text-muted-foreground">{formatDate(getValue() as string)}</span>
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
            {row.original.merchant}
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
            Owner
            <DiscreteFilter label="Owner" options={ownerOpts} selected={ownerSel} onChange={setOwnerSel} />
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
          <div className="text-right">
            <Money value={-row.original.amount} signed={row.original.amount < 0} />
            {row.original.pending ? (
              <Badge className="ml-2" tone="accent">
                pending
              </Badge>
            ) : null}
          </div>
        ),
      },
    ],
    [merchantOpts, merchantSel, accountOpts, accountSel, ownerOpts, ownerSel, catOpts, catSel, amountRule],
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
    getPaginationRowModel: getPaginationRowModel(),
    enableSortingRemoval: true,
    sortDescFirst: false,
    initialState: { pagination: { pageSize: 50 } },
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
      <div className="mb-3 flex items-center gap-3">
        <Input
          placeholder="Search merchant, account, category"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-xs text-muted-foreground font-mono tabular-nums">{filteredRows.length} rows</span>
        <ResetFilters
          dirty={
            Boolean(q) ||
            merchantSel != null ||
            accountSel != null ||
            ownerSel != null ||
            catSel != null ||
            amountRule.op !== "any"
          }
          onReset={() => {
            setQ("");
            setMerchantSel(null);
            setAccountSel(null);
            setOwnerSel(null);
            setCatSel(null);
            setAmountRule(emptyAmountRule());
          }}
        />
      </div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className={h.column.id === "amount" ? "cursor-pointer text-right" : "cursor-pointer"}
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
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setOpen(row.original);
                    setMerchant(row.original.merchant);
                    setCategory(row.original.category ?? "");
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </Button>
      </div>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="overflow-y-auto">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.merchant}</SheetTitle>
                <SheetDescription>
                  {formatDate(open.date)} · {open.account} · {open.institution}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                <div>
                  <div className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Amount</div>
                  <Money value={-open.amount} signed={open.amount < 0} className="text-lg" />
                </div>
                <div>
                  <div className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Raw description</div>
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
