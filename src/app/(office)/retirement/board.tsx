"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  manual?: boolean;
  beneficiary?: string | null;
};

/** The retirement accounts table. Balances only; planning lives in the Retirement planner. */
export function RetirementAccounts({ rows }: { rows: RetirementCard[] }) {
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
                  <TableHead className="hidden sm:table-cell">Holder</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Holdings</TableHead>
                  <TableHead className="num">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="w-full max-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <BrandLabel className="min-w-0" kind="institution" name={r.institution}>
                          <span className="truncate">{r.name}</span>
                        </BrandLabel>
                        {r.manual ? <RemoveHsa id={r.id} /> : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{r.ownerLabel}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{hausTypeLabel(r.kind)}</TableCell>
                    <TableCell className="hidden max-w-0 truncate text-muted-foreground lg:table-cell">
                      {(r.holdings ?? []).length === 0
                        ? "—"
                        : (r.holdings ?? [])
                            .map((h) => h.symbol || h.name)
                            .slice(0, 8)
                            .join(" · ")}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap">
                      <Money value={r.balance} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="footnote px-[var(--space-card)] py-3">
              {IRS_LIMITS_YEAR} catch-up (not applied automatically): IRA +$1,100 (50+); 401(k)/403(b) +$8,000 (50+) or +$11,250
              (60–63); HSA +$1,000 (55+). Family HSA limit shown for HSA accounts.
            </p>
          </CardContent>
        </Card>
  );
}
