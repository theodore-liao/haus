"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UiScaleSlider } from "@/components/ui-scale";

export function SettingsClient({
  nameA,
  nameB,
}: {
  nameA: string;
  nameB: string;
}) {
  const router = useRouter();
  const [t, setT] = useState(nameA);
  const [j, setJ] = useState(nameB);

  async function saveNames() {
    const res = await fetch("/api/household", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nameA: t, nameB: j }),
    });
    if (!res.ok) toast.error("Could not save names.");
    else {
      toast.success("Household names saved.");
      router.refresh();
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/lock";
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Household</CardTitle>
        </CardHeader>
        <CardContent className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_minmax(13rem,16rem)]">
          <div>
            <Label>Primary</Label>
            <Input className="mt-1" value={t} onChange={(e) => setT(e.target.value)} />
          </div>
          <div>
            <Label>Spouse</Label>
            <Input className="mt-1" value={j} onChange={(e) => setJ(e.target.value)} />
          </div>
          <UiScaleSlider />
          <div className="sm:col-span-2 xl:col-span-3">
            <Button size="sm" onClick={saveNames}>
              Save names
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Haus is a household app. Plaid access tokens never leave the server. The ledger lives in a local SQLite
            database. There is no public marketing site, no OAuth login, and no money movement.
          </p>
          <Button variant="outline" size="sm" onClick={logout}>
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
