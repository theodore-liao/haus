"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

export function CashflowControls({
  month,
  includeTransfers,
}: {
  month: string;
  includeTransfers: boolean;
}) {
  const router = useRouter();

  function push(next: { month?: string; transfers?: boolean }) {
    const m = next.month ?? month;
    const t = next.transfers ?? includeTransfers;
    const qs = new URLSearchParams();
    qs.set("month", m);
    if (t) qs.set("transfers", "1");
    router.push(`/cashflow?${qs.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Input type="month" value={month} onChange={(e) => push({ month: e.target.value })} className="w-[160px]" />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch checked={includeTransfers} onCheckedChange={(v) => push({ transfers: v })} />
        <span>
          <Label className="normal-case tracking-normal text-muted-foreground">Include transfers & card payments</Label>
        </span>
      </label>
    </div>
  );
}
