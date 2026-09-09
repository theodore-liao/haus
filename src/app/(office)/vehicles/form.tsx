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
  year: number | null;
  make: string;
  model: string;
  estimate: number;
  loanBalance: number | null;
  asOfDate: string;
  owner: string;
};

export function VehicleForm({
  names,
  existing,
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
  existing?: Existing;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: existing?.id,
          label: fd.get("label"),
          year: fd.get("year") ? Number(fd.get("year")) : null,
          make: fd.get("make") || undefined,
          model: fd.get("model") || undefined,
          estimate: Number(fd.get("estimate")),
          loanBalance: fd.get("loanBalance") ? Number(fd.get("loanBalance")) : 0,
          asOfDate: fd.get("asOfDate"),
          owner: fd.get("owner"),
        }),
      });
      if (!res.ok) toast.error("Could not save vehicle.");
      else {
        toast.success("Vehicle saved.");
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button variant={existing ? "outline" : "default"} size="sm" onClick={() => setOpen(true)}>
          {existing ? "Edit" : "Add vehicle"}
        </Button>
        {existing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await fetch("/api/vehicles", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: existing.id }),
              });
              router.refresh();
            }}
          >
            Remove
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{existing ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-3">
            <div>
              <Label>Label</Label>
              <Input className="mt-1" name="label" required defaultValue={existing?.label} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Year</Label>
                <Input className="mt-1" name="year" type="number" defaultValue={existing?.year ?? undefined} />
              </div>
              <div>
                <Label>Make</Label>
                <Input className="mt-1" name="make" defaultValue={existing?.make} />
              </div>
              <div>
                <Label>Model</Label>
                <Input className="mt-1" name="model" defaultValue={existing?.model} />
              </div>
            </div>
            <div>
              <Label>Market value (USD)</Label>
              <Input className="mt-1" name="estimate" type="number" required defaultValue={existing?.estimate} />
              <p className="mt-1 text-xs text-muted-foreground">What the vehicle is worth today, not remaining loan.</p>
            </div>
            <div>
              <Label>Remaining loan (USD)</Label>
              <Input className="mt-1" name="loanBalance" type="number" defaultValue={existing?.loanBalance ?? 0} />
              <p className="mt-1 text-xs text-muted-foreground">Payoff. Use 0 if owned free and clear.</p>
            </div>
            <div>
              <Label>As of</Label>
              <Input className="mt-1" name="asOfDate" type="date" required defaultValue={existing?.asOfDate} />
            </div>
            <div>
              <Label>Owner</Label>
              <select
                name="owner"
                defaultValue={existing?.owner ?? "joint"}
                className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                {ownerOptions(names).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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
