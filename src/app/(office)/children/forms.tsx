"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { givenName, ownerOptions } from "@/lib/owners";

type Existing = {
  id: string;
  hausType: string;
  name: string;
  owner: string;
  beneficiary: string;
  balance: number;
  asOfDate: string;
};

export function ChildrenForms({
  names,
  existing,
  actions = "all",
}: {
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
  existing?: Existing;
  actions?: "all" | "child" | "entry";
}) {
  const router = useRouter();
  const [childOpen, setChildOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);

  return (
    <>
      {existing ? (
        <Button variant="outline" size="sm" onClick={() => setAcctOpen(true)}>
          Edit
        </Button>
      ) : (
        <>
          {actions !== "entry" ? (
            <Button variant="outline" size="sm" onClick={() => setChildOpen(true)}>
              Add child
            </Button>
          ) : null}
          {actions !== "child" ? (
            <Button variant="outline" size="sm" onClick={() => setAcctOpen(true)}>
              {actions === "entry" ? "Add entry" : "Add account"}
            </Button>
          ) : null}
        </>
      )}
      <Dialog open={childOpen} onOpenChange={setChildOpen}>
        <DialogContent persist>
          <DialogHeader>
            <DialogTitle>Add child</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") || "");
              const res = await fetch("/api/children", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
              });
              if (!res.ok) toast.error("Could not add child.");
              else {
                setChildOpen(false);
                router.refresh();
              }
            }}
          >
            <div>
              <Label>Name</Label>
              <Input className="mt-1" name="name" required />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={acctOpen} onOpenChange={setAcctOpen}>
        <DialogContent persist>
          <DialogHeader>
            <DialogTitle>{existing ? "Update account" : "Manual child account"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Use when a 529, custodial, or Trump Account is not available through an aggregator. Labeled as a
            manual record. Trump Accounts have a $5,000 combined annual contribution limit in 2026.
          </p>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const res = await fetch("/api/manual-accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: existing?.id,
                  hausType: fd.get("hausType"),
                  name: fd.get("name"),
                  owner: fd.get("owner"),
                  beneficiary: fd.get("beneficiary"),
                  balance: Number(fd.get("balance")),
                  asOfDate: fd.get("asOfDate"),
                }),
              });
              if (!res.ok) toast.error("Could not save.");
              else {
                setAcctOpen(false);
                router.refresh();
              }
            }}
          >
            <div>
              <Label>Type</Label>
              <select
                name="hausType"
                defaultValue={existing?.hausType ?? "529"}
                className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                <option value="529">529</option>
                <option value="custodial">Custodial (UTMA/UGMA)</option>
                <option value="trump">Trump Account</option>
              </select>
            </div>
            <div>
              <Label>Name</Label>
              <Input className="mt-1" name="name" defaultValue={existing?.name} required />
            </div>
            <div>
              <Label>Holder</Label>
              <select
                name="owner"
                defaultValue={existing?.owner}
                className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                {ownerOptions(names).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>For child</Label>
              <select
                name="beneficiary"
                defaultValue={childIdFor(existing?.beneficiary, names.children)}
                className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                <option value="">Unassigned</option>
                {names.children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {givenName(c.name) || c.name}
                  </option>
                ))}
              </select>
              {names.children.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Add children under Settings → Household first.</p>
              ) : null}
            </div>
            <div>
              <Label>Balance</Label>
              <Input className="mt-1" name="balance" type="number" step="any" defaultValue={existing?.balance} required />
            </div>
            <div>
              <Label>As of</Label>
              <Input className="mt-1" name="asOfDate" type="date" defaultValue={existing?.asOfDate} required />
            </div>
            <Button type="submit">{existing ? "Update amount" : "Save manual record"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function childIdFor(raw: string | undefined, children: { id: string; name: string }[]) {
  const b = (raw ?? "").trim();
  if (!b) return "";
  if (children.some((c) => c.id === b)) return b;
  const hit = children.find(
    (c) => c.name.toLowerCase() === b.toLowerCase() || givenName(c.name).toLowerCase() === givenName(b).toLowerCase(),
  );
  return hit?.id ?? "";
}
