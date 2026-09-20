"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLabel } from "@/components/brand-mark";
import { hausTypeLabel } from "@/lib/account-types";
import { AllocationChart } from "@/components/charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RemoveHsa } from "./hsa-form";
import type { SliceItem } from "@/components/category-merchants";
import { withHolder } from "@/lib/owners";
import { Money } from "@/components/money";
import { HeroCard } from "@/components/hero-card";
import { ChartCard } from "@/components/chart-card";
import { RetirementProjection, type Holder } from "./projection";

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
}: {
  rows: RetirementCard[];
  holders: Holder[];
  /** Server-side "today" (YYYY-MM-DD) so the projection renders identically on both sides. */
  today: string;
}) {
  const donut = rows.map((r) => ({
    key: withHolder(r.name, r.ownerLabel),
    value: r.balance,
    items: r.holdings,
  }));
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
        <ChartCard kicker="By account">
          <AllocationChart data={donut} />
        </ChartCard>
        <ChartCard kicker="Projection">
          <RetirementProjection balance={total} defaultContribution={annualised} holders={holders} today={today} />
        </ChartCard>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Holdings</TableHead>
                <TableHead className="num">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2">
                      <BrandLabel kind="institution" name={r.institution}>
                        {r.name}
                      </BrandLabel>
                      {r.manual ? <RemoveHsa id={r.id} /> : null}
                    </div>
                  </TableCell>
                  <TableCell>{r.ownerLabel}</TableCell>
                  <TableCell className="text-muted-foreground">{hausTypeLabel(r.kind)}</TableCell>
                  <TableCell className="max-w-[18rem] truncate text-muted-foreground">
                    {(r.holdings ?? []).length === 0
                      ? "—"
                      : (r.holdings ?? [])
                          .map((h) => h.symbol || h.name)
                          .slice(0, 8)
                          .join(" · ")}
                  </TableCell>
                  <TableCell className="num">
                    <Money value={r.balance} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
