"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ownerOptions } from "@/lib/owners";
import {
  amortize,
  housingEscrow,
  monthlyPi,
  piFromPayment,
  remainingFromPayment,
  yearLabel,
} from "@/lib/amortization";
import { formatMoney } from "@/lib/format";

type Existing = {
  id: string;
  label: string;
  address: string;
  estimate: number;
  asOfDate: string;
  owner: string;
  mortgageBalance: number | null;
  rate: number | null;
  termMonths: number | null;
  originalTermMonths: number | null;
  originationDate: string | null;
  taxAnnual: number | null;
  insuranceAnnual: number | null;
  escrowMonthly: number | null;
  pmiMonthly: number | null;
  piti: number | null;
  rent: number | null;
};

export function PropertyForm({
  names,
  existing,
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
  existing?: Existing;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const opts = ownerOptions(names);

  const [principal, setPrincipal] = useState(String(existing?.mortgageBalance ?? 0));
  const [rate, setRate] = useState(existing?.rate != null ? String(existing.rate) : "");
  const [originalYears, setOriginalYears] = useState(
    existing?.originalTermMonths ? String(existing.originalTermMonths / 12) : "30",
  );
  const [origination, setOrigination] = useState(
    existing?.originationDate ? existing.originationDate.slice(0, 7) : "",
  );
  const seededPayment = (() => {
    if (existing?.piti) return String(existing.piti);
    if (existing?.mortgageBalance && existing.rate && existing.termMonths) {
      const pi = monthlyPi(existing.mortgageBalance, existing.rate, existing.termMonths);
      const esc = housingEscrow({
        taxAnnual: existing.taxAnnual,
        insuranceAnnual: existing.insuranceAnnual,
        escrowMonthly: existing.escrowMonthly,
        pmiMonthly: existing.pmiMonthly,
      });
      return pi ? String(Math.round((pi + esc.escrowAndPmi) * 100) / 100) : "";
    }
    return "";
  })();
  const [monthlyPayment, setMonthlyPayment] = useState(seededPayment);
  const seededEscrow =
    existing?.escrowMonthly ||
    ((existing?.taxAnnual ?? 0) + (existing?.insuranceAnnual ?? 0) > 0
      ? ((existing?.taxAnnual ?? 0) + (existing?.insuranceAnnual ?? 0)) / 12
      : 0);
  const [escrowMonthly, setEscrowMonthly] = useState(seededEscrow ? String(Math.round(seededEscrow * 100) / 100) : "");
  const [pmiMonthly, setPmiMonthly] = useState(existing?.pmiMonthly ? String(existing.pmiMonthly) : "");

  const preview = useMemo(() => {
    const P = Number(principal) || 0;
    const apr = Number(rate) || 0;
    const housing = housingEscrow({
      escrowMonthly: escrowMonthly ? Number(escrowMonthly) : null,
      pmiMonthly: Number(pmiMonthly) || 0,
    });
    const stated = Number(monthlyPayment) || 0;
    const pi = stated > 0 ? piFromPayment(stated, housing.escrowAndPmi) : 0;
    const n = P > 0 && apr >= 0 && pi > 0 ? remainingFromPayment(P, apr, pi) : 0;
    const interestOnly = apr > 0 && pi > 0 && pi <= P * (apr / 100 / 12) + 1e-8;
    if (P <= 0 || n <= 0 || apr < 0) {
      return { n, pi, housing, interestOnly, summary: null as ReturnType<typeof amortize> };
    }
    return {
      n,
      pi,
      housing,
      interestOnly,
      summary: amortize({ principal: P, aprPct: apr, remainingMonths: n }),
    };
  }, [principal, rate, monthlyPayment, escrowMonthly, pmiMonthly]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const n = preview.n > 0 ? preview.n : null;
      const originationDate = origination ? `${origination}-01` : null;
      const originalTermMonths = Number(originalYears) > 0 ? Math.round(Number(originalYears) * 12) : null;
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: existing?.id,
          label: fd.get("label"),
          address: fd.get("address") || undefined,
          estimate: Number(fd.get("estimate")),
          asOfDate: fd.get("asOfDate"),
          owner: fd.get("owner"),
          mortgageBalance: Number(principal) || 0,
          mortgageAccountId: null,
          rate: rate ? Number(rate) : null,
          termMonths: n,
          originalTermMonths,
          originationDate,
          extraPrincipal: 0,
          taxAnnual: null,
          insuranceAnnual: null,
          escrowMonthly: escrowMonthly ? Number(escrowMonthly) : null,
          pmiMonthly: pmiMonthly ? Number(pmiMonthly) : null,
          piti: Number(monthlyPayment) || (preview.pi ? preview.pi + preview.housing.escrowAndPmi : null),
          rent: fd.get("rent") ? Number(fd.get("rent")) : null,
        }),
      });
      if (!res.ok) toast.error("Could not save property.");
      else {
        toast.success("Property saved.");
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    await fetch("/api/properties", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: existing.id }),
    });
    router.refresh();
  }

  return (
    <>
      <div className="flex gap-2">
        <Button variant={existing ? "outline" : "default"} size="sm" onClick={() => setOpen(true)}>
          {existing ? "Edit" : "Add property"}
        </Button>
        {existing && (
          <Button variant="ghost" size="sm" onClick={remove}>
            Remove
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent persist className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{existing ? "Edit property" : "Add property"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-3">
            <Field name="label" label="Label" defaultValue={existing?.label} required />
            <Field name="address" label="Address" defaultValue={existing?.address} />
            <div>
              <Label>Market value (USD)</Label>
              <Input className="mt-1" name="estimate" type="number" defaultValue={existing?.estimate} required />
            </div>
            <Field name="asOfDate" label="Value as of" type="date" defaultValue={existing?.asOfDate} required />
            <div>
              <Label>Holder</Label>
              <select
                name="owner"
                defaultValue={existing?.owner ?? "joint"}
                className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-1 border-t border-border pt-3 kicker">
              Mortgage (from this month’s statement)
            </div>
            <div>
              <Label>Remaining principal</Label>
              <Input className="mt-1" type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Interest rate %</Label>
                <Input className="mt-1" type="number" step="0.001" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
              <div>
                <Label>Original term</Label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
                  value={originalYears}
                  onChange={(e) => setOriginalYears(e.target.value)}
                >
                  <option value="15">15 year</option>
                  <option value="20">20 year</option>
                  <option value="30">30 year</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Monthly payment (to the lender)</Label>
              <Input
                className="mt-1"
                type="number"
                step="0.01"
                value={monthlyPayment}
                onChange={(e) => setMonthlyPayment(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Statement total (P&amp;I + escrow). Remaining term is calculated after subtracting escrow.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First payment (optional)</Label>
                <Input className="mt-1" type="month" value={origination} onChange={(e) => setOrigination(e.target.value)} />
              </div>
              <div />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Escrow / month</Label>
                <Input
                  className="mt-1"
                  type="number"
                  step="0.01"
                  value={escrowMonthly}
                  onChange={(e) => setEscrowMonthly(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">Taxes + insurance from the statement.</p>
              </div>
              <div>
                <Label>PMI / month</Label>
                <Input className="mt-1" type="number" value={pmiMonthly} onChange={(e) => setPmiMonthly(e.target.value)} />
              </div>
            </div>
            {preview.interestOnly ? (
              <p className="text-sm text-negative">
                After escrow, the payment does not cover interest. Check the rate, payment, or escrow amounts.
              </p>
            ) : null}
            {preview.summary || preview.housing.escrowAndPmi > 0 || preview.pi > 0 ? (
              <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <Stat k="Monthly PI" v={formatMoney(preview.pi)} />
                <Stat k="Escrow / month" v={formatMoney(preview.housing.escrow)} />
                <Stat
                  k="Remaining"
                  v={
                    preview.n
                      ? `${Math.floor(preview.n / 12)} yr ${preview.n % 12} mo`
                      : "—"
                  }
                />
                <Stat k="Payoff" v={preview.summary ? yearLabel(preview.summary.payoff) : "—"} />
                <Stat k="Interest left" v={preview.summary ? formatMoney(preview.summary.interestRemaining) : "—"} />
              </div>
            ) : null}
            <Field name="rent" label="Rent / month" type="number" defaultValue={existing?.rent ?? undefined} />
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="kicker">{k}</div>
      <div className={v.includes("$") ? "num money" : "num"}>{v}</div>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  required,
  step,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
  step?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input className="mt-1" name={name} type={type} step={step} defaultValue={defaultValue} required={required} />
    </div>
  );
}
