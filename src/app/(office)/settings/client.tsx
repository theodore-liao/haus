"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DisplayPrefs } from "@/components/display-prefs";
import { RefreshButton } from "@/components/refresh-button";
import { formatDateTime } from "@/lib/format";
import Link from "next/link";

type ChildRow = { id: string; name: string };

export function SettingsClient({
  nameA,
  nameB,
  birthdateA,
  birthdateB,
  householdChildren: initialChildren,
  connectionCount,
  lastSynced,
}: {
  nameA: string;
  nameB: string;
  birthdateA: string | null;
  birthdateB: string | null;
  householdChildren: ChildRow[];
  connectionCount: number;
  lastSynced: string | null;
}) {
  const router = useRouter();
  const [t, setT] = useState(nameA);
  const [j, setJ] = useState(nameB);
  const [dobA, setDobA] = useState(birthdateA ?? "");
  const [dobB, setDobB] = useState(birthdateB ?? "");
  const [kids, setKids] = useState(initialChildren);
  const [newChild, setNewChild] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveNames() {
    setBusy(true);
    try {
      const res = await fetch("/api/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameA: t, nameB: j, birthdateA: dobA || null, birthdateB: dobB || null }),
      });
      if (!res.ok) {
        toast.error("Could not save names.");
        return;
      }
      const renamed = kids.filter((k) => {
        const orig = initialChildren.find((c) => c.id === k.id);
        return orig && orig.name !== k.name && k.name.trim();
      });
      for (const k of renamed) {
        const r = await fetch("/api/children", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: k.id, name: k.name.trim() }),
        });
        if (!r.ok) {
          toast.error("Could not save a child name.");
          return;
        }
      }
      toast.success("Household saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addChild() {
    const name = newChild.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        toast.error("Could not add child.");
        return;
      }
      const data = (await res.json()) as { child?: ChildRow };
      if (data.child) setKids((cur) => [...cur, data.child!].sort((a, b) => a.name.localeCompare(b.name)));
      setNewChild("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeChild(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/children", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        toast.error("Could not remove child.");
        return;
      }
      setKids((cur) => cur.filter((k) => k.id !== id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/lock";
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="lg:row-span-3">
        <CardHeader>
          <CardTitle>Household</CardTitle>
        </CardHeader>
        <CardContent className="grid items-end gap-4 sm:grid-cols-2">
          <div>
            <Label>Primary</Label>
            <Input className="mt-1.5" value={t} onChange={(e) => setT(e.target.value)} />
          </div>
          <div>
            <Label>Spouse</Label>
            <Input className="mt-1.5" value={j} onChange={(e) => setJ(e.target.value)} />
          </div>
          <div>
            <Label>{t || "Primary"} birthdate</Label>
            <Input type="date" className="mt-1.5" value={dobA} onChange={(e) => setDobA(e.target.value)} />
          </div>
          <div>
            <Label>{j || "Spouse"} birthdate</Label>
            <Input type="date" className="mt-1.5" value={dobB} onChange={(e) => setDobB(e.target.value)} />
          </div>
          <p className="footnote sm:col-span-2">
            Birthdates drive the retirement projection (years to retirement age) and never leave this machine.
          </p>
          <div className="space-y-3 sm:col-span-2">
            <div>
              <Label>Children</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Used to label 529s, custodial accounts, and Trump Accounts.
              </p>
            </div>
            {kids.length === 0 ? (
              <p className="text-sm text-muted-foreground">No children yet.</p>
            ) : (
              <ul className="space-y-2">
                {kids.map((k) => (
                  <li key={k.id} className="flex items-center gap-2">
                    <Input
                      value={k.name}
                      onChange={(e) =>
                        setKids((cur) => cur.map((c) => (c.id === k.id ? { ...c, name: e.target.value } : c)))
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => removeChild(k.id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add a child"
                value={newChild}
                onChange={(e) => setNewChild(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addChild();
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" disabled={busy || !newChild.trim()} onClick={addChild}>
                Add
              </Button>
            </div>
            <Button size="sm" disabled={busy} onClick={saveNames}>
              Save household
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
        </CardHeader>
        <CardContent>
          <DisplayPrefs />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="kicker">Connections</div>
              <div className="num mt-1">{connectionCount}</div>
            </div>
            <div>
              <div className="kicker">Last sync</div>
              <div className="num mt-1">{formatDateTime(lastSynced)}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton lastSynced={lastSynced} autoSync={false} />
            <Button variant="outline" size="sm" asChild>
              <Link href="/connections">Manage connections</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy &amp; session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Plaid access tokens never leave the server. The ledger lives in a local SQLite database. There is no
            public site, no OAuth login, and no money movement.
          </p>
          <Button variant="outline" size="sm" onClick={logout}>
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
