"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLabel } from "@/components/brand-mark";
import { hausTypeLabel } from "@/lib/account-types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RemoveHsa } from "./hsa-form";
import type { SliceItem } from "@/components/category-merchants";
import { Money } from "@/components/money";
import { HeroCard } from "@/components/hero-card";
import { ChartCard } from "@/components/chart-card";
import { RetirementProjection, type Holder } from "./projection";
import type { ProjectionPrefs } from "@/lib/projection-prefs";

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

export function RetirementBoard({
  rows,
  holders,
  today,
  projectionPrefs,
}: {
  rows: RetirementCard[];
  holders: Holder[];
  /** Server-side "today" (YYYY-MM-DD) so the projection renders identically on both sides. */
  today: string;
  projectionPrefs: ProjectionPrefs;
}) {
  const total = rows.reduce((s, r) => s + r.balance, 0);
  // YTD contributions scaled to a full year seed the projection's contribution input.
  const ytd = rows.reduce((s, r) => s + r.ytd, 0);
  const t = new Date(`${today}T00:00:00Z`);
  const yearFraction = Math.max(1 / 12, (t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / (365.25 * 86400000));
  const annualised = ytd / yearFraction;

  return (
    <div className="page-stack">
      <HeroCard kicker="Retirement">
        <Money value={total} />
      </HeroCard>
      <div className="relative z-0 grid items-stretch gap-4 lg:grid-cols-2">
        <Card>
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
          </CardContent>
        </Card>
        <ChartCard kicker="Projection">
          <RetirementProjection
            balance={total}
            defaultContribution={annualised}
            holders={holders}
            today={today}
            saved={projectionPrefs}
          />
        </ChartCard>
      </div>
    </div>
  );
}
