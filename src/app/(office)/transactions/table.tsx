"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Callout } from "@/components/callout";
import { ConfirmButton } from "@/components/confirm-button";
import { withoutInstitution } from "@/lib/account-label";
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
import { ReportRange } from "@/components/chart-range";
import { defaultTxnWindow, inWindow, type WindowKey } from "@/lib/range";
import type { TxnRow } from "@/lib/txn-row";
import { visibleSlice } from "@/lib/virtual-range";
import { ArrowDown, ArrowUp, StickyNote } from "lucide-react";
import type { Cadence, RecurringKind } from "@/lib/recurring";

const RECURRING_CHOICES: { kind: RecurringKind; label: string }[] = [
  { kind: "loan", label: "Loan payments" },
  { kind: "bill", label: "Bills" },
  { kind: "subscription", label: "Subscriptions" },
];

const CADENCE_CHOICES: { cadence: Cadence; label: string }[] = [
  { cadence: "weekly", label: "Weekly" },
  { cadence: "biweekly", label: "Every 2 weeks" },
  { cadence: "monthly", label: "Monthly" },
  { cadence: "bimonthly", label: "Every 2 months" },
  { cadence: "quarterly", label: "Quarterly" },
  { cadence: "semiannual", label: "Twice a year" },
  { cadence: "annual", label: "Yearly" },
];

type RecurringChoice = { on: boolean; kind: RecurringKind; cadence: Cadence };

function CardMatchNote({ match, className = "shrink-0" }: { match: TxnRow["cardMatch"]; className?: string }) {
  if (match !== "matched") return null;
  return <span className={`${className} text-xs font-normal text-muted-foreground`}>Matches another account</span>;
}

function NoteMark({ memo }: { memo: string | null }) {
  if (!memo) return null;
  return <StickyNote className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Has a note" />;
}

function merchantGroup(r: TxnRow) {
  return r.cardMatch === "matched" ? `${r.merchant} · matches another account` : r.merchant;
}

/** Rows kept before Show more. Sorting and filtering still run over the full set. */
const PAGE = 250;
const DESK_ROW = 40;
const PHONE_ROW = 68;

function txnHay(r: TxnRow) {
  return [
    r.merchant,
    r.rawMerchant,
    r.name,
    r.account,
    r.accountMask,
    r.institution,
    r.ownerLabel,
    r.category ? categoryLabel(r.category) : "",
    r.categoryDetailed ? categoryLabel(r.categoryDetailed) : "",
    r.memo,
    r.pending ? "pending" : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function useMeasuredRow(fallback: number) {
  const [px, setPx] = useState(fallback);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const next = el.getBoundingClientRect().height;
    if (next > 1) setPx((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
  }, []);
  return [px, ref] as const;
}

/** Rows of `anchor` that sit inside `scroller`, or inside the window when there is no scroller. */
function useSlice(count: number, rowPx: number, anchor: HTMLElement | null, scroller: HTMLElement | null) {
  const [slice, setSlice] = useState({ start: 0, end: Math.min(count, 40) });
  useEffect(() => {
    if (!anchor) return;
    let frame = 0;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        const next = { start: 0, end: Math.min(count, 24) };
        setSlice((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
        return;
      }
      const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const view = scroller ? scroller.clientHeight : window.innerHeight;
      const next = visibleSlice(viewTop - rect.top, view, count, rowPx);
      setSlice((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    if (!scroller) window.addEventListener("resize", onScroll);
    const ro = new ResizeObserver(onScroll);
    ro.observe(anchor);
    if (scroller) ro.observe(scroller);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener("scroll", onScroll);
      if (!scroller) window.removeEventListener("resize", onScroll);
      ro.disconnect();
    };
  }, [anchor, scroller, count, rowPx]);
  const start = Math.min(slice.start, count);
  const end = Math.min(count, Math.max(slice.end, start));
  return { start, end };
}

const COL_WIDTH: Record<string, string> = {
  date: "w-[7.5rem]",
  ownerLabel: "w-[6rem]",
  category: "w-[11rem]",
  memo: "w-[10rem]",
  amount: "w-[9rem]",
};

export function TransactionsTable({
  rows,
  readOnly = false,
  dateChips = false,
  containerClassName,
  initialQuery = "",
  lead,
  defaultRange,
}: {
  rows: TxnRow[];
  /** Shown at the start of the toolbar (the page's tabs). */
  lead?: ReactNode;
  /** Chip selected on first show when dateChips is on. */
  defaultRange?: WindowKey;
  readOnly?: boolean;
  /** Preset month chips. Transactions page (All and Refunds tabs). */
  dateChips?: boolean;
  containerClassName?: string;
  /** Opens with this search (a link from Overview). A search looks through every transaction until a chip is picked. */
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [limit, setLimit] = useState(PAGE);
  /** A chip picked while searching narrows the search to that window. Clearing the search forgets it. */
  const [chipDuringSearch, setChipDuringSearch] = useState(false);
  const typed = q.trim();
  // The list follows a deferred copy, so a keystroke updates the box before the rows are filtered.
  const deferredQuery = useDeferredValue(typed);
  const filtering = deferredQuery.length > 0;
  const searchAll = filtering && !chipDuringSearch;
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [deskBody, setDeskBody] = useState<HTMLTableSectionElement | null>(null);
  const [phoneList, setPhoneList] = useState<HTMLUListElement | null>(null);
  const [range, setRange] = useState<WindowKey | null>(() =>
    dateChips ? (initialQuery ? "1m" : (defaultRange ?? defaultTxnWindow())) : null,
  );
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [merchantSel, setMerchantSel] = useState<Set<string> | null>(null);
  const [accountSel, setAccountSel] = useState<Set<string> | null>(null);
  const [ownerSel, setOwnerSel] = useState<Set<string> | null>(null);
  const [catSel, setCatSel] = useState<Set<string> | null>(null);
  const [amountRule, setAmountRule] = useState<AmountRule>(emptyAmountRule());
  const [dateSel, setDateSel] = useState<Set<string> | null>(null);
  const [open, setOpen] = useState<TxnRow | null>(null);

  function edit(t: TxnRow) {
    setOpen(t);
  }

  const searchText = useMemo(() => {
    const text = new Map<string, string>();
    for (const row of rows) text.set(row.id, txnHay(row));
    return text;
  }, [rows]);
  const windowedRows = useMemo(
    () => (range == null || searchAll ? rows : rows.filter((r) => inWindow(r.date, range))),
    [rows, range, searchAll],
  );
  const merchantOpts = useMemo(() => [...new Set(windowedRows.map((r) => merchantGroup(r)))].sort(), [windowedRows]);
  const accountOpts = useMemo(() => [...new Set(windowedRows.map((r) => r.account))].sort(), [windowedRows]);
  const ownerOpts = useMemo(() => [...new Set(windowedRows.map((r) => r.ownerLabel))].sort(), [windowedRows]);
  const catOpts = useMemo(
    () => [...new Set(windowedRows.map((r) => categoryLabel(r.category)))].sort(),
    [windowedRows],
  );
  const dateOpts = useMemo(() => windowedRows.map((r) => r.date), [windowedRows]);
  const filteredRows = useMemo(() => {
    return windowedRows.filter((r) => {
      if (dateSel && !dateSel.has(dateMonthKey(r.date))) return false;
      if (merchantSel && !merchantSel.has(merchantGroup(r))) return false;
      if (accountSel && !accountSel.has(r.account)) return false;
      if (ownerSel && !ownerSel.has(r.ownerLabel)) return false;
      if (catSel && !catSel.has(categoryLabel(r.category))) return false;
      if (!amountPasses(-r.amount, amountRule)) return false;
      return true;
    });
  }, [windowedRows, dateSel, merchantSel, accountSel, ownerSel, catSel, amountRule]);

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
          <BrandLabel kind="merchant" name={row.original.merchant} className="flex max-w-full">
            <span className="flex min-w-0 max-w-full items-center gap-1.5">
              <span className="min-w-0 truncate">{row.original.merchant}</span>
              <CardMatchNote match={row.original.cardMatch} />
              <NoteMark memo={row.original.memo} />
            </span>
          </BrandLabel>
        ),
      },
      ...(readOnly
        ? [
            {
              accessorKey: "name",
              header: "Raw description",
              cell: ({ row }: { row: { original: TxnRow } }) => (
                <span className="block truncate" title={row.original.name}>
                  {row.original.name}
                </span>
              ),
            } satisfies ColumnDef<TxnRow>,
          ]
        : []),
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
      ...(readOnly
        ? [
            {
              accessorKey: "memo",
              header: "Note",
              cell: ({ row }: { row: { original: TxnRow } }) =>
                row.original.memo ? (
                  <span className="block truncate" title={row.original.memo}>
                    {row.original.memo}
                  </span>
                ) : null,
            } satisfies ColumnDef<TxnRow>,
          ]
        : []),
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
    [dateOpts, dateSel, merchantOpts, merchantSel, accountOpts, accountSel, ownerOpts, ownerSel, catOpts, catSel, amountRule, readOnly],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, globalFilter: deferredQuery },
    onSortingChange: setSorting,
    onGlobalFilterChange: updateQuery,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const needle = String(filterValue ?? "").trim().toLowerCase();
      if (!needle) return true;
      return (searchText.get(row.original.id) ?? "").includes(needle);
    },
    enableSortingRemoval: true,
    sortDescFirst: false,
  });

  const listed = table.getRowModel().rows.length;
  const outsideChip = dateChips && range != null ? rows.length - windowedRows.length : 0;
  const columnCount = columns.length;
  const shown = filtering ? listed : limit;
  const matched = table.getRowModel().rows.slice(0, shown);
  const [deskPx, deskProbe] = useMeasuredRow(DESK_ROW);
  const [phonePx, phoneProbe] = useMeasuredRow(PHONE_ROW);
  const desk = useSlice(matched.length, deskPx, deskBody, scroller);
  const phone = useSlice(matched.length, phonePx, phoneList, readOnly ? scroller : null);
  const deskRows = matched.slice(desk.start, desk.end);
  const phoneRows = matched.slice(phone.start, phone.end);
  useEffect(() => {
    scroller?.scrollTo({ top: 0 });
  }, [deferredQuery, scroller]);

  function updateQuery(next: string) {
    setQ(next);
    if (!next.trim()) setChipDuringSearch(false);
  }

  function moreButton(wide: boolean) {
    if (listed > shown) {
      const next = Math.min(PAGE, listed - limit);
      return (
        <Button type="button" variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
          Show {next.toLocaleString("en-US")} more
          {wide ? ` of ${(listed - limit).toLocaleString("en-US")} remaining` : ""}
        </Button>
      );
    }
    if (outsideChip > 0) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setRange(null);
            setChipDuringSearch(false);
          }}
        >
          Show {outsideChip.toLocaleString("en-US")} more transactions
        </Button>
      );
    }
    return null;
  }
  const scrollClass =
    containerClassName ?? "max-h-[calc(100dvh-17rem)] overscroll-contain md:max-h-[calc(100dvh-14.5rem)]";

  return (
    <div ref={readOnly ? setScroller : undefined} className={readOnly ? scrollClass + " min-h-0 overflow-auto" : undefined}>
      <div className={readOnly ? "section-head" : "section-head txn-toolbar"}>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {lead}
          <SearchInput
            placeholder={readOnly ? "Search merchant, description, note" : "Search merchant, account, category"}
            value={q}
            onChange={updateQuery}
          />
          <span className="footnote num whitespace-nowrap">
            {listed.toLocaleString("en-US")} {listed === 1 ? "row" : "rows"}
          </span>
        </div>
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
            updateQuery("");
            setDateSel(null);
            setMerchantSel(null);
            setAccountSel(null);
            setOwnerSel(null);
            setCatSel(null);
            setAmountRule(emptyAmountRule());
          }}
        />
        {dateChips ? (
          <div className="ml-auto">
            <ReportRange
              value={typed.length > 0 && !chipDuringSearch ? null : range}
              onChange={(key) => {
                setRange(key);
                setLimit(PAGE);
                if (typed.length > 0) setChipDuringSearch(true);
              }}
            />
          </div>
        ) : null}
      </div>
      {/* Phones get a two-line list; the wide table needs a desktop. Same rows, same sort, same edit sheet. */}
      <div className="rounded-[var(--radius-card)] border border-border bg-card md:hidden">
        {listed === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <p>No transactions match this filter.</p>
            {outsideChip > 0 ? <div className="mt-3">{moreButton(false)}</div> : null}
          </div>
        ) : (
          <ul ref={setPhoneList}>
            {phone.start > 0 ? <li aria-hidden className="border-0 p-0" style={{ height: phone.start * phonePx }} /> : null}
            {phoneRows.map((row, i) => {
              const t = row.original;
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    {/* Block-level flex so the label is held to the row width and the name ends in "…". */}
                    <BrandLabel kind="merchant" name={t.merchant} className="flex">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm">{t.merchant}</span>
                        <CardMatchNote match={t.cardMatch} className="min-w-0 truncate" />
                        <NoteMark memo={t.memo} />
                      </span>
                    </BrandLabel>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      <span className="num">{formatDate(t.date)}</span> · {categoryLabel(t.category)} · {t.account}
                    </div>
                    {readOnly && t.name && t.name !== t.merchant ? (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{t.name}</div>
                    ) : null}
                    {readOnly && t.memo ? (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{t.memo}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.pending ? <Badge tone="accent">pending</Badge> : null}
                    <Money value={-t.amount} signed={t.amount < 0} className="text-sm" />
                  </div>
                </>
              );
              return (
                <li key={row.id} ref={i === 0 ? phoneProbe : undefined} className="border-b border-border last:border-0">
                  {readOnly ? (
                    <div className="flex w-full items-center gap-3 px-4 py-3 text-left">{body}</div>
                  ) : (
                    <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => edit(t)}>
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
            {phone.end < matched.length ? (
              <li aria-hidden className="border-0 p-0" style={{ height: (matched.length - phone.end) * phonePx }} />
            ) : null}
            {moreButton(false) ? <li className="py-3 text-center">{moreButton(false)}</li> : null}
          </ul>
        )}
      </div>

      <div className="hidden rounded-[var(--radius-card)] border border-border bg-card md:block">
        <Table
          className="table-fixed"
          containerClassName={readOnly ? "overflow-visible" : scrollClass}
          containerRef={readOnly ? undefined : setScroller}
        >
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col key={column.id} className={COL_WIDTH[column.id] ?? "w-auto"} />
            ))}
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
          <TableBody ref={setDeskBody}>
            {listed === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="py-10 text-center text-sm text-muted-foreground">
                  <p>No transactions match this filter.</p>
                  {outsideChip > 0 ? <div className="mt-3">{moreButton(true)}</div> : null}
                </TableCell>
              </TableRow>
            ) : (
              <>
                {desk.start > 0 ? (
                  <tr aria-hidden>
                    <td colSpan={columnCount} style={{ padding: 0, border: 0 }}>
                      <div style={{ height: desk.start * deskPx }} />
                    </td>
                  </tr>
                ) : null}
                {deskRows.map((row, i) => (
                  <TableRow
                    key={row.id}
                    ref={i === 0 ? deskProbe : undefined}
                    className={readOnly ? undefined : "cursor-pointer"}
                    onClick={readOnly ? undefined : () => edit(row.original)}
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
                ))}
                {desk.end < matched.length ? (
                  <tr aria-hidden>
                    <td colSpan={columnCount} style={{ padding: 0, border: 0 }}>
                      <div style={{ height: (matched.length - desk.end) * deskPx }} />
                    </td>
                  </tr>
                ) : null}
              </>
            )}
            {listed > 0 && moreButton(true) ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="py-3 text-center">
                  {moreButton(true)}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {readOnly ? null : <TransactionSheet row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export type TxnSave = {
  id: string;
  merchant: string;
  category: string | null;
  memo: string | null;
  applyToMerchant: boolean;
  cardMatch: TxnRow["cardMatch"];
  rawMerchant: string | null;
  name: string;
  previousMerchant: string;
};

export function TransactionSheet({
  row,
  onClose,
  onSaved,
}: {
  row: TxnRow | null;
  onClose: () => void;
  onSaved?: (patch: TxnSave) => void;
}) {
  const router = useRouter();
  return (
    <TransactionSheetForm
      key={row?.id ?? "closed"}
      row={row}
      onClose={onClose}
      onSaved={onSaved}
      routerRefresh={() => router.refresh()}
    />
  );
}

function TransactionSheetForm({
  row,
  onClose,
  onSaved,
  routerRefresh,
}: {
  row: TxnRow | null;
  onClose: () => void;
  onSaved?: (patch: TxnSave) => void;
  routerRefresh: () => void;
}) {
  const [merchant, setMerchant] = useState(row?.merchant ?? "");
  const [category, setCategory] = useState(row?.category ?? "");
  const [memo, setMemo] = useState(row?.memo ?? "");
  const [applyAll, setApplyAll] = useState(true);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  // Whether this merchant is listed under Recurring, read when the sheet opens. Only charges can recur.
  const canRecur = row != null && row.amount > 0 && !row.internal;
  const [recurring, setRecurring] = useState<RecurringChoice & { loaded: boolean; was: RecurringChoice }>({
    loaded: false,
    on: false,
    kind: "subscription",
    cadence: "monthly",
    was: { on: false, kind: "subscription", cadence: "monthly" },
  });
  useEffect(() => {
    if (!row || !canRecur) return;
    let live = true;
    fetch(`/api/recurring?merchant=${encodeURIComponent(row.merchant)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { kind: RecurringKind | null; cadence: Cadence | null } | null) => {
        if (!live || !body) return;
        const state: RecurringChoice = {
          on: body.kind != null,
          kind: body.kind ?? "subscription",
          cadence: body.cadence ?? "monthly",
        };
        setRecurring({ loaded: true, ...state, was: state });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [row, canRecur]);
  const categoryOptions =
    !category || HAUS_CATEGORIES.some((c) => c.code === category)
      ? HAUS_CATEGORIES
      : [...HAUS_CATEGORIES, { code: category, label: categoryLabel(category) }];

  async function save() {
    if (!row) return;
    const nextMerchant = merchant.trim();
    const nextMemo = memo.trim() || null;
    const nextCategory = category || null;
    // A note-only save must not pin the current category on every transaction from the merchant.
    const applyToMerchant =
      applyAll && (nextCategory !== (row.category ?? null) || nextMerchant !== row.merchant);
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        userMerchant: nextMerchant || null,
        userCategory: nextCategory,
        memo: nextMemo,
        applyToMerchant,
      }),
    });
    // Recurring is set for the merchant, so it is saved only when the choice changed.
    const recurringChanged =
      canRecur && recurring.loaded && (recurring.on !== recurring.was.on ||
        (recurring.on && (recurring.kind !== recurring.was.kind || recurring.cadence !== recurring.was.cadence)));
    const recurringRes = recurringChanged
      ? await fetch("/api/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchant: row.merchant, kind: recurring.on ? recurring.kind : null, cadence: recurring.on ? recurring.cadence : undefined }),
        }).catch(() => null)
      : null;
    if (recurringChanged && !recurringRes?.ok) toast.error("Saved, but could not change Recurring.");
    if (!res.ok) toast.error("Could not save.");
    else {
      if (!recurringChanged || recurringRes?.ok) toast.success("Saved.");
      onSaved?.({
        id: row.id,
        merchant: nextMerchant,
        category: nextCategory,
        memo: nextMemo,
        applyToMerchant,
        cardMatch: row.cardMatch,
        rawMerchant: row.rawMerchant,
        name: row.name,
        previousMerchant: row.merchant,
      });
      onClose();
      routerRefresh();
    }
  }

  return (
      <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="overflow-hidden p-0">
          {row && (
            <div ref={setHost} className="relative flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <SheetHeader>
                <SheetTitle>{row.merchant}</SheetTitle>
                <SheetDescription>
                  {formatDate(row.date)} · {withoutInstitution(row.account, row.institution)}
                  {row.cardMatch === "matched" ? " · Matches another account" : ""}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                <div>
                  <div className="kicker">Amount</div>
                  <Money value={-row.amount} signed={row.amount < 0} className="text-lg" />
                </div>
                <div>
                  <div className="kicker">Raw description</div>
                  <p className="mt-1 text-sm">{row.name}</p>
                </div>
                <div>
                  <Label>Merchant display</Label>
                  <Input className="mt-1" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={category || undefined} onValueChange={setCategory}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Uncategorized" />
                    </SelectTrigger>
                    <SelectContent container={host}>
                      {categoryOptions.map((c) => (
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
                {canRecur ? (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Switch
                        checked={recurring.on}
                        disabled={!recurring.loaded}
                        onCheckedChange={(on) => setRecurring((cur) => ({ ...cur, on }))}
                      />
                      Recurring charge
                    </label>
                    {recurring.on ? (
                      <div>
                        <Label>Counts as</Label>
                        <Select value={recurring.kind} onValueChange={(kind) => setRecurring((cur) => ({ ...cur, kind: kind as RecurringKind }))}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent container={host}>
                            {RECURRING_CHOICES.map((c) => (
                              <SelectItem key={c.kind} value={c.kind}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Label className="mt-3 block">How often</Label>
                        <Select value={recurring.cadence} onValueChange={(cadence) => setRecurring((cur) => ({ ...cur, cadence: cadence as Cadence }))}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent container={host}>
                            {CADENCE_CHOICES.map((c) => (
                              <SelectItem key={c.cadence} value={c.cadence}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="footnote mt-1">Applies to every charge from this merchant.</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div>
                  <Label>Note</Label>
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={memo}
                    maxLength={500}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </div>
                {row.cardMatch === "matched" ? (
                  <Callout tone="info">
                    The same amount landed in another linked account, so this is marked Transfer. If you recategorize, the auto-detected Transfer will be overwritten.
                  </Callout>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={save}>Save</Button>
                  <ConfirmButton
                    variant="destructive"
                    size="default"
                    title={`Hide ${row.merchant}?`}
                    description="Every current and future transaction from this merchant will leave Transactions, Cashflow, and Spending."
                    confirmLabel="Hide"
                    onConfirm={async () => {
                      const res = await fetch("/api/transactions", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          merchant: row.merchant,
                          rawMerchant: row.rawMerchant,
                          name: row.name,
                        }),
                      });
                      if (!res.ok) toast.error("Could not hide merchant.");
                      else {
                        toast.success("Merchant hidden.");
                        onClose();
                        routerRefresh();
                      }
                    }}
                  >
                    Hide this merchant
                  </ConfirmButton>
                </div>
              </div>
            </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
  );
}
