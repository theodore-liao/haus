"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { InvestmentsBoard, type HoldingRow } from "@/components/holdings-table";
import { LargestMoves, type AssetMover } from "@/components/largest-moves";
import { ManualStockFormDialog, type ManualStock } from "@/components/manual-stocks";
import { FIXED_USD_ID } from "@/lib/constants";

export function InvestmentsDesk({
  names,
  manuals,
  rows,
  movers,
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
  manuals: ManualStock[];
  rows: HoldingRow[];
  movers: AssetMover[];
}) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ManualStock | null>(null);
  const byId = useMemo(() => new Map(manuals.map((m) => [m.id, m])), [manuals]);
  const manualRows: HoldingRow[] = manuals.map((h) => {
    const value = h.coingeckoId === FIXED_USD_ID ? (h.quotePrice ?? 0) : (h.quotePrice ?? 0) * h.quantity;
    return {
    id: h.id,
    symbol: h.coingeckoId === FIXED_USD_ID ? null : h.symbol,
    name: h.name,
    class: h.assetClass || "equity",
    account: h.accountName || "Manual",
    institution: h.accountName || "Manual",
    ownerLabel: h.ownerLabel,
    qty: h.coingeckoId === FIXED_USD_ID ? 0 : h.quantity,
    last: h.coingeckoId === FIXED_USD_ID ? null : h.quotePrice,
    value,
    costBasis: h.costBasis ?? null,
    dayPl: h.quoteChange != null ? h.quoteChange * h.quantity : null,
    totalPl: h.costBasis != null ? value - h.costBasis : null,
    dayPct: h.quoteChangePct ?? null,
    weight: 0,
    manual: true,
    updatedAt: h.updatedAt ?? null,
    accounts: [h.accountName || "Manual"],
    brandKind: "security",
  };
  });
  const donutRows = [...manualRows, ...rows];

  return (
    <>
      <InvestmentsBoard
        rows={donutRows}
        tableRows={donutRows}
        accountOnly
        besideAccount={<LargestMoves movers={movers.filter((m) => m.kind === "security" && !m.retirement)} />}
        onEditManual={(id) => {
          const row = byId.get(id);
          if (!row) return;
          setEdit(row);
          setOpen(true);
        }}
        headerAction={
          <>
            <Button type="button" size="sm" variant="outline" asChild>
              <a href="/connections">Add connection</a>
            </Button>
            <Button
              type="button"
              size="sm"
              className="cursor-pointer"
              onClick={() => {
                setEdit(null);
                setOpen(true);
              }}
            >
              Add manual entry
            </Button>
          </>
        }
      />
      <ManualStockFormDialog names={names} existing={edit} open={open} onOpenChange={setOpen} />
    </>
  );
}
