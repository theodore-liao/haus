"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ownerOptions } from "@/lib/owners";

export function AddHsa({
  names,
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add HSA
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent persist>
          <DialogHeader>
            <DialogTitle>Manual HSA</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Enter an HSA that is not linked through a brokerage. Update the balance when it changes.
          </p>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const fd = new FormData(e.currentTarget);
              try {
                const res = await fetch("/api/manual-accounts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    hausType: "hsa",
                    name: fd.get("name"),
                    owner: fd.get("owner"),
                    balance: Number(fd.get("balance")),
                    asOfDate: fd.get("asOfDate"),
                    notes: fd.get("notes") || undefined,
                  }),
                });
                if (!res.ok) toast.error("Could not save HSA.");
                else {
                  toast.success("HSA added.");
                  setOpen(false);
                  router.refresh();
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            <div>
              <Label>Name</Label>
              <Input className="mt-1" name="name" placeholder="Fidelity HSA" required />
            </div>
            <div>
              <Label>Balance (USD)</Label>
              <Input className="mt-1" name="balance" type="number" step="0.01" required />
            </div>
            <div>
              <Label>As of</Label>
              <Input className="mt-1" name="asOfDate" type="date" defaultValue={today} required />
            </div>
            <div>
              <Label>Holder</Label>
              <select name="owner" className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm">
                {ownerOptions(names).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input className="mt-1" name="notes" />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RemoveHsa({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-[11px] text-muted-foreground hover:text-negative"
      onClick={async (e) => {
        e.stopPropagation();
        await fetch("/api/manual-accounts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        router.refresh();
      }}
    >
      Remove
    </button>
  );
}
