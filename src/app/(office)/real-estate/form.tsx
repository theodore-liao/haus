"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ownerOptions } from "@/lib/owners";

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
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
          mortgageBalance: fd.get("mortgageBalance") ? Number(fd.get("mortgageBalance")) : 0,
          mortgageAccountId: null,
          rate: fd.get("rate") ? Number(fd.get("rate")) : null,
          termMonths: fd.get("termMonths") ? Number(fd.get("termMonths")) : null,
          piti: fd.get("piti") ? Number(fd.get("piti")) : null,
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{existing ? "Edit property" : "Add property"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-3">
            <Field name="label" label="Label" defaultValue={existing?.label} required />
            <Field name="address" label="Address" defaultValue={existing?.address} />
            <div>
              <Label>Market value (USD)</Label>
              <Input
                className="mt-1"
                name="estimate"
                type="number"
                defaultValue={existing?.estimate}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">What the property is worth today, not remaining debt.</p>
            </div>
            <div>
              <Label>Remaining mortgage (USD)</Label>
              <Input
                className="mt-1"
                name="mortgageBalance"
                type="number"
                defaultValue={existing?.mortgageBalance ?? 0}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Payoff / remaining principal. Use 0 if owned free and clear. Equity is market value minus this.
              </p>
            </div>
            <Field name="asOfDate" label="As of" type="date" defaultValue={existing?.asOfDate} required />
            <div>
              <Label>Owner</Label>
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
            <div className="grid grid-cols-2 gap-3">
              <Field name="rate" label="Rate %" type="number" step="0.001" defaultValue={existing?.rate ?? undefined} />
              <Field name="termMonths" label="Term (months)" type="number" defaultValue={existing?.termMonths ?? undefined} />
              <Field name="piti" label="PITI / month" type="number" defaultValue={existing?.piti ?? undefined} />
              <Field name="rent" label="Rent / month" type="number" defaultValue={existing?.rent ?? undefined} />
            </div>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
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
