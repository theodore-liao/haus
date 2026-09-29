"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryTrendChart } from "@/components/category-trend";
import { formatDate } from "@/lib/format";
import { holdingLabel } from "@/lib/holding-label";
import type { ContributionRow } from "@/lib/queries";
import type { TrendPoint } from "@/lib/spend-compare";
import { BrandLabel } from "@/components/brand-mark";
import { hausTypeLabel } from "@/lib/account-types";
import { IRS_LIMITS_YEAR } from "@/lib/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RemoveHsa } from "./hsa-form";
import type { SliceItem } from "@/components/category-merchants";
import { Money } from "@/components/money";

export type RetirementCard = {
  id: string;
  name: string;
  institution: string | null;
  owner: string;
  ownerLabel: string;
  childLabel: string | null;
  kind: string;
  balance: number;
  ytd: number;
  limit: number;
  holdings?: SliceItem[];
  /** Deposits into the account, newest first. */
  contributions?: ContributionRow[];
  manual?: boolean;
  beneficiary?: string | null;
};

/** Deposits by month for the last twelve, ending with the open month. */
function monthlyTrend(rows: ContributionRow[], now = new Date()): TrendPoint[] {
  const byMonth = new Map<string, number>();
  for (const c of rows) byMonth.set(c.date.slice(0, 7), (byMonth.get(c.date.slice(0, 7)) ?? 0) + c.amount);
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const out: TrendPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ month, label: d.toLocaleString("en-US", { month: "short" }), value: byMonth.get(month) ?? 0, partial: month === current });
  }
  return out;
}

/** One account's deposits: this year and all time, a month-by-month chart, then every deposit. */
function ContributionHistory({ row, onClose }: { row: RetirementCard | null; onClose: () => void }) {
  const trend = useMemo(() => monthlyTrend(row?.contributions ?? []), [row]);
  const deposits = row?.contributions ?? [];
  const year = String(new Date().getFullYear());
  const thisYear = deposits.filter((c) => c.date.startsWith(year)).reduce((s, c) => s + c.amount, 0);
  const total = deposits.reduce((s, c) => s + c.amount, 0);
  return (
    <Dialog open={row != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row?.name}</DialogTitle>
          <DialogDescription>Contribution history{row ? ` · ${row.ownerLabel}` : ""}</DialogDescription>
        </DialogHeader>
        {deposits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {row?.manual ? "Contributions are not tracked for accounts you enter by hand." : "No contributions found in this account yet."}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              <Money value={thisYear} /> so far in {year} · <Money value={total} /> across {deposits.length} {deposits.length === 1 ? "deposit" : "deposits"}
            </p>
            <CategoryTrendChart category="Retirement accounts" data={trend} />
            <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm">
              {deposits.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 border-b border-border py-1.5 last:border-0">
                  <span className="min-w-0">
                    <span className="block truncate">{c.label}</span>
                    <span className="footnote">
                      {formatDate(c.date)}
                      {c.fromPay ? " · From pay" : ""}
                    </span>
                  </span>
                  <Money value={c.amount} className="shrink-0" />
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The retirement accounts table. Balances only; planning lives in the Retirement planner. */
export function RetirementAccounts({ rows }: { rows: RetirementCard[] }) {
  const hasManual = rows.some((r) => r.manual);
  const [open, setOpen] = useState<RetirementCard | null>(null);
  return (
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Retirement Accounts</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="hidden w-20 sm:table-cell">Holder</TableHead>
                  <TableHead className="hidden w-24 md:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Holdings</TableHead>
                  <TableHead className="num w-32">Value</TableHead>
                  {hasManual ? (
                    <TableHead className="w-24">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} onClick={() => setOpen(r)} className="cursor-pointer">
                    <TableCell className="w-full max-w-0">
                      <button
                        type="button"
                        aria-label={`Contribution history for ${r.name}`}
                        className="flex max-w-full min-w-0 cursor-pointer items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <BrandLabel className="min-w-0" kind="institution" name={r.institution}>
                          <span className="truncate">{r.name}</span>
                        </BrandLabel>
                      </button>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{r.ownerLabel}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{hausTypeLabel(r.kind)}</TableCell>
                    <TableCell className="hidden max-w-0 truncate text-muted-foreground lg:table-cell">
                      {(r.holdings ?? []).length === 0
                        ? "—"
                        : (r.holdings ?? [])
                            .map((h) => holdingLabel(h))
                            .slice(0, 8)
                            .join(" · ")}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap">
                      <Money value={r.balance} />
                    </TableCell>
                    {hasManual ? (
                      <TableCell className="w-24 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                        {r.manual ? <RemoveHsa id={r.id} /> : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="footnote px-[var(--space-card)] py-3">
              {IRS_LIMITS_YEAR} catch-up (not applied automatically): IRA +$1,100 (50+); 401(k)/403(b) +$8,000 (50+) or +$11,250
              (60–63); HSA +$1,000 (55+). Family HSA limit shown for HSA accounts.
            </p>
          </CardContent>
          <ContributionHistory row={open} onClose={() => setOpen(null)} />
        </Card>
  );
}
