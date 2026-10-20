"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ownerOptions } from "@/lib/owners";
import { localDayKey } from "@/lib/range";

/** Commas and at most two decimals, as every amount box shows. */
function withCommas(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

/** "$45,000", "45000.5" → a non-negative number; anything else is null. */
function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^\d*\.?\d+$|^\d+\.?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Retirement account types the household can enter by hand. */
const TYPES = [
  { value: "401k", label: "401(k)", example: "Work 401(k)" },
  { value: "403b", label: "403(b)", example: "Work 403(b)" },
  { value: "ira", label: "Traditional IRA", example: "Rollover IRA" },
  { value: "roth", label: "Roth IRA", example: "Roth IRA" },
  { value: "hsa", label: "HSA", example: "Health savings account" },
] as const;

type Names = { nameA: string; nameB: string; children: { id: string; name: string }[] };

export type ManualRetirement = {
  id: string;
  hausType: string;
  name: string;
  owner: string;
  balance: number;
  asOfDate: string;
  notes: string | null;
};

/**
 * Add or edit a retirement account the household can't link: a work plan without online access, an old IRA. The balance
 * stays as entered until someone updates it.
 */
export function RetirementAccountForm({
  names,
  existing,
  onDone,
}: {
  names: Names;
  existing?: ManualRetirement;
  /** After a save, for a window that opened this form and now shows an old balance. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const today = localDayKey();
  // A retirement account belongs to one person. An older entry saved as Joint keeps that choice.
  const holders = ownerOptions(names, existing?.owner).filter((o) => o.value === "a" || o.value === "b" || o.value === existing?.owner);
  const blank = () => ({
    hausType: existing?.hausType ?? "401k",
    name: existing?.name ?? "",
    owner: existing?.owner ?? "a",
    // Kept as typed, so Save always uses what's on screen; commas are added on leaving the box.
    balance: existing ? withCommas(existing.balance) : "",
    asOfDate: existing?.asOfDate ?? today,
    notes: existing?.notes ?? "",
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blank);
  const set = <K extends keyof ReturnType<typeof blank>>(key: K, value: ReturnType<typeof blank>[K]) => setForm((f) => ({ ...f, [key]: value }));
  const type = TYPES.find((t) => t.value === form.hausType) ?? TYPES[0];
  const balance = parseMoney(form.balance);
  const missing = !form.name.trim()
    ? "Add a name."
    : form.balance.trim() === ""
      ? "Add the balance."
      : balance == null
        ? "Enter the balance as a number, like 45,000."
        : !form.asOfDate
          ? "Add the date of the balance."
          : null;

  async function save() {
    if (missing) return;
    setBusy(true);
    try {
      const res = await fetch("/api/manual-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: existing?.id,
          hausType: form.hausType,
          name: form.name.trim(),
          owner: form.owner,
          balance,
          asOfDate: form.asOfDate,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        toast.error("Could not save this account.");
        return;
      }
      toast.success(existing ? "Account updated." : "Account added.");
      setOpen(false);
      onDone?.();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={existing ? "px-2" : undefined}
        onClick={() => {
          setForm(blank());
          setOpen(true);
        }}
      >
        {existing ? "Edit" : "Add retirement account"}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent persist className="max-w-md">
          <DialogHeader>
            <DialogTitle>{existing ? "Edit retirement account" : "Add a retirement account"}</DialogTitle>
            <DialogDescription>
              For an account you can&apos;t link. It counts in your totals and the planner; update the balance when it changes.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="retirement-type">Type</Label>
                <Select value={form.hausType} onValueChange={(v) => set("hausType", v)}>
                  <SelectTrigger id="retirement-type" className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="retirement-holder">Holder</Label>
                <Select value={form.owner} onValueChange={(v) => set("owner", v)}>
                  <SelectTrigger id="retirement-holder" className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {holders.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="retirement-name">Name</Label>
              <Input
                id="retirement-name"
                className="mt-1"
                value={form.name}
                placeholder={type.example}
                maxLength={80}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="retirement-balance">Balance</Label>
                <div className="field-box mt-1">
                  <span className="field-affix">$</span>
                  <input
                    id="retirement-balance"
                    inputMode="decimal"
                    autoComplete="off"
                    className="money"
                    placeholder="0"
                    value={form.balance}
                    onChange={(e) => set("balance", e.target.value)}
                    onBlur={() => {
                      const n = parseMoney(form.balance);
                      if (n != null) set("balance", withCommas(n));
                    }}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="retirement-asof">As of</Label>
                <Input id="retirement-asof" className="mt-1" type="date" value={form.asOfDate} max={today} onChange={(e) => set("asOfDate", e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="retirement-notes">Notes (optional)</Label>
              <Input id="retirement-notes" className="mt-1" value={form.notes} maxLength={200} onChange={(e) => set("notes", e.target.value)} />
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              {missing ? <span className="footnote mr-auto">{missing}</span> : null}
              <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || missing != null}>
                {busy ? "Saving…" : existing ? "Save" : "Add account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RemoveRetirementAccount({ id, name, onDone }: { id: string; name: string; onDone?: () => void }) {
  const router = useRouter();
  return (
    <ConfirmButton
      className="px-2"
      title={`Remove ${name}?`}
      description="It leaves your retirement accounts and totals. Add it again to bring it back."
      onConfirm={async () => {
        const res = await fetch("/api/manual-accounts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) {
          toast.error("Could not remove this account.");
          return;
        }
        onDone?.();
        router.refresh();
      }}
    >
      Remove
    </ConfirmButton>
  );
}
