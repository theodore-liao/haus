"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ownerOptions } from "@/lib/owners";
import { Money } from "@/components/money";
import { formatDate } from "@/lib/format";

export function VehiclesCard({
  vehicles,
  names,
}: {
  vehicles: { id: string; label: string; estimate: number; asOfDate: string; owner: string }[];
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Vehicles (manual)</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          Add vehicle
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {vehicles.length === 0 ? (
          <p className="text-muted-foreground">No vehicles. Aggregators do not cover cars; this is a manual estimate.</p>
        ) : (
          vehicles.map((v) => (
            <div key={v.id} className="flex justify-between border-b border-border py-2 last:border-0">
              <span>
                {v.label}
                <span className="text-muted-foreground"> · as of {formatDate(v.asOfDate)}</span>
              </span>
              <span className="flex items-center gap-2">
                <Money value={v.estimate} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await fetch("/api/vehicles", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: v.id }),
                    });
                    router.refresh();
                  }}
                >
                  Remove
                </Button>
              </span>
            </div>
          ))
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add vehicle</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const res = await fetch("/api/vehicles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  label: fd.get("label"),
                  year: fd.get("year") ? Number(fd.get("year")) : null,
                  make: fd.get("make"),
                  model: fd.get("model"),
                  estimate: Number(fd.get("estimate")),
                  asOfDate: fd.get("asOfDate"),
                  owner: fd.get("owner"),
                }),
              });
              if (!res.ok) toast.error("Could not save vehicle.");
              else {
                setOpen(false);
                router.refresh();
              }
            }}
          >
            <div>
              <Label>Label</Label>
              <Input className="mt-1" name="label" required placeholder="Family SUV" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Year</Label>
                <Input className="mt-1" name="year" type="number" />
              </div>
              <div>
                <Label>Make</Label>
                <Input className="mt-1" name="make" />
              </div>
              <div>
                <Label>Model</Label>
                <Input className="mt-1" name="model" />
              </div>
            </div>
            <div>
              <Label>Estimate</Label>
              <Input className="mt-1" name="estimate" type="number" required />
            </div>
            <div>
              <Label>As of</Label>
              <Input className="mt-1" name="asOfDate" type="date" required />
            </div>
            <div>
              <Label>Owner</Label>
              <select name="owner" className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm">
                {ownerOptions(names).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Save</Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
