"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { BrandLabel } from "@/components/brand-mark";
import { hausTypeLabel } from "@/lib/account-types";
import { SortableGrid, useStoredOrder } from "@/components/sortable-grid";
import { SliceBreakdownDialog, type SliceItem } from "@/components/category-merchants";
import { RemoveHsa } from "./hsa-form";

export type RetirementCard = {
  id: string;
  name: string;
  institution: string | null;
  ownerLabel: string;
  kind: string;
  balance: number;
  ytd: number;
  limit: number;
  holdings?: SliceItem[];
  manual?: boolean;
};

export function RetirementBoard({ rows }: { rows: RetirementCard[] }) {
  const [ordered, reorder] = useStoredOrder("haus.retirementOrder", rows);
  const [open, setOpen] = useState<RetirementCard | null>(null);

  return (
    <>
      <SortableGrid
        items={ordered}
        onReorder={reorder}
        render={(r, handle) => {
          return (
            <Card className="h-full cursor-pointer" onClick={() => setOpen(r)}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="text-base font-medium normal-case tracking-normal text-foreground">
                    {hausTypeLabel(r.kind)}
                  </CardTitle>
                  <div className="mt-1 text-sm text-muted-foreground">{r.ownerLabel}</div>
                </div>
                <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {r.manual ? <RemoveHsa id={r.id} /> : null}
                  {handle}
                </span>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <BrandLabel kind="institution" name={r.institution}>
                    {r.name}
                  </BrandLabel>
                </div>
                <div className="mt-2 text-2xl font-medium font-mono tabular-nums">
                  <Money value={r.balance} />
                </div>
                {r.limit > 0 ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    YTD <Money value={r.ytd} className="text-xs" /> / {r.limit.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        }}
      />
      <SliceBreakdownDialog
        open={open != null}
        title={open?.name ?? "Retirement"}
        rows={open?.holdings ?? []}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
