"use client";

import { useMemo, useState } from "react";
import { CategoryBars } from "@/components/charts";
import { ChartRange } from "@/components/chart-range";
import { DEFAULT_RANGE, inRange, type RangeKey } from "@/lib/range";
import { CategoryMerchantDialog, aggregateMerchants, type MerchantLine } from "@/components/category-merchants";

export function SpendPanel({
  cats,
  merchants,
}: {
  cats: { label: string; value: number; date: string }[];
  merchants: (MerchantLine & { date: string })[];
}) {
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [popup, setPopup] = useState<{ title: string; lines: MerchantLine[] } | null>(null);
  const slicedCats = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const c of cats) {
      if (!inRange(c.date, range)) continue;
      sums[c.label] = (sums[c.label] ?? 0) + c.value;
    }
    return Object.entries(sums)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [cats, range]);
  const slicedMerch = useMemo(
    () => merchants.filter((m) => inRange(m.date, range)),
    [merchants, range],
  );

  return (
    <>
      <div className="mb-2 flex justify-end">
        <ChartRange value={range} onChange={setRange} />
      </div>
      <CategoryBars data={slicedCats} onBarClick={(label) => setPopup({ title: label, lines: aggregateMerchants(slicedMerch, label) })} />
      <CategoryMerchantDialog
        open={popup != null}
        title={popup?.title ?? ""}
        lines={popup?.lines ?? []}
        onClose={() => setPopup(null)}
      />
    </>
  );
}
