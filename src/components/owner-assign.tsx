"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { hausTypeLabel } from "@/lib/account-types";
import { accountLabel } from "@/lib/account-label";

type Account = { id: string; name: string; mask: string | null; hausType: string; owner: string };
type Item = { id: string; institutionName: string | null; accounts: Account[] };

export function OwnerAssign({ item, onDone }: { item: Item; onDone: () => void }) {
  const [open, setOpen] = useState(true);
  const [owners, setOwners] = useState<Record<string, string>>(
    Object.fromEntries(item.accounts.map((a) => [a.id, a.owner || "joint"])),
  );
  const [options, setOptions] = useState<{ value: string; label: string }[]>([
    { value: "a", label: "One" },
    { value: "b", label: "Two" },
    { value: "joint", label: "Joint" },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/household")
      .then((r) => r.json())
      .then((d) => {
        if (d.options) setOptions(d.options);
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/accounts/owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, owners }),
      });
      if (!res.ok) {
        toast.error("Could not save owners.");
        return;
      }
      await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      toast.success("Owners saved. Syncing the household ledger.");
      setOpen(false);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) return;
        setOpen(v);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign owners</DialogTitle>
          <DialogDescription>
            {item.institutionName ?? "Institution"} is linked. Assign each account to a household member, joint, or a
            child before it enters the household totals.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {item.accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
              <div>
                <div className="text-sm">
                  {accountLabel(a.name, item.institutionName)}
                  {a.mask ? <span className="text-muted-foreground"> · {a.mask}</span> : null}
                </div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  {hausTypeLabel(a.hausType)}
                </div>
              </div>
              <div className="w-40">
                <Label className="sr-only">Owner</Label>
                <Select value={owners[a.id]} onValueChange={(v) => setOwners((s) => ({ ...s, [a.id]: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save and sync"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
