"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DisplayPrefs } from "@/components/display-prefs";
import { RefreshButton } from "@/components/refresh-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { NAV, OPTIONAL_NAV, type TabVisibility } from "@/lib/nav";
import type { TxnRow } from "@/lib/txn-row";
import Link from "next/link";
import { TransactionsTable } from "../transactions/table";

type ChildRow = { id: string; name: string };

export function SettingsClient({
  nameA,
  nameB,
  birthdateA,
  birthdateB,
  householdChildren: initialChildren,
  pairCardPayments,
  keepTransactions,
  transactionsStoredSince,
  tabs: initialTabs,
  connectionCount,
  lastSynced,
}: {
  nameA: string;
  nameB: string;
  birthdateA: string | null;
  birthdateB: string | null;
  householdChildren: ChildRow[];
  pairCardPayments: boolean;
  keepTransactions: boolean;
  transactionsStoredSince: string | null;
  tabs: TabVisibility;
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
  const [pairCards, setPairCards] = useState(pairCardPayments);
  const [keepTxns, setKeepTxns] = useState(keepTransactions);
  const [storedSince, setStoredSince] = useState(transactionsStoredSince);
  const [tabs, setTabs] = useState(initialTabs);
  const [showSaved, setShowSaved] = useState(false);
  const [savedRows, setSavedRows] = useState<TxnRow[] | null>(null);
  const [savedError, setSavedError] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);

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

  async function setCardPairing(on: boolean) {
    setPairCards(on);
    const res = await fetch("/api/household", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairCardPayments: on }),
    });
    if (!res.ok) {
      setPairCards(!on);
      toast.error("Could not save that setting.");
      return;
    }
    router.refresh();
  }

  async function setKeep(on: boolean) {
    setKeepTxns(on);
    const res = await fetch("/api/household", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepTransactions: on }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      syncError?: string;
      transactionsStoredSince?: string | null;
    };
    if (!res.ok) {
      setKeepTxns(!on);
      toast.error(data.error ?? "Could not save that setting.");
      return;
    }
    if (data.transactionsStoredSince) setStoredSince(data.transactionsStoredSince);
    if (data.syncError) toast.error(data.syncError);
    else if (on) toast.success("Transaction history is being stored.");
    router.refresh();
  }

  async function openSaved() {
    setShowSaved(true);
    setSavedRows(null);
    setSavedError(false);
    const res = await fetch("/api/saved-transactions");
    if (!res.ok) {
      setSavedError(true);
      return;
    }
    const data = (await res.json()) as { rows?: TxnRow[] };
    setSavedRows(data.rows ?? []);
  }

  async function wipeSaved() {
    setWiping(true);
    try {
      const res = await fetch("/api/saved-transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        toast.error("Could not delete saved transactions.");
        return;
      }
      toast.success("Local transaction history deleted.");
      setSavedRows([]);
      setKeepTxns(false);
      setStoredSince(null);
      setConfirmWipe(false);
      router.refresh();
    } finally {
      setWiping(false);
    }
  }

  async function setTab(field: (typeof OPTIONAL_NAV)[number]["field"], key: (typeof OPTIONAL_NAV)[number]["key"], on: boolean) {
    const previous = tabs[key];
    setTabs((cur) => ({ ...cur, [key]: on }));
    const res = await fetch("/api/household", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: on }),
    });
    if (!res.ok) {
      setTabs((cur) => ({ ...cur, [key]: previous }));
      toast.error("Could not save that setting.");
      return;
    }
    router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/lock";
  }

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Card>
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
              <Label>Child Accounts</Label>
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

      <div className="grid gap-4">
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
          <CardTitle>Tabs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Choose which sections appear in the sidebar.</p>
          {OPTIONAL_NAV.map((tab) => {
            const label = NAV.find((item) => item.href === tab.href)?.label ?? tab.key;
            return (
              <label key={tab.key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">{label}</span>
                <Switch
                  checked={tabs[tab.key]}
                  onCheckedChange={(on) => void setTab(tab.field, tab.key, on)}
                  aria-label={`Show ${label}`}
                />
              </label>
            );
          })}
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
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-foreground">Auto label transfers</div>
              <p className="mt-1 text-muted-foreground">
                Automatically categorizes transactions as &quot;Transfer&quot; when money flows between connected accounts.
              </p>
            </div>
            <Switch
              checked={pairCards}
              onCheckedChange={(on) => void setCardPairing(on)}
              className="mt-0.5 shrink-0"
              aria-label="Auto label transfers"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-foreground">Store transaction history</div>
                {storedSince ? (
                  <p className="mt-1 text-xs text-muted-foreground">Since {format(new Date(storedSince), "d MMM yyyy")}</p>
                ) : null}
                <p className="mt-1 text-muted-foreground">
                  Saves your transaction history directly in the app to bypass data limits set by certain banks connected through
                  Plaid.
                </p>
              </div>
              <Switch
                checked={keepTxns}
                onCheckedChange={(on) => {
                  if (on) void setKeep(true);
                  else setConfirmWipe(true);
                }}
                className="mt-0.5 shrink-0"
                aria-label="Store transaction history"
              />
            </div>
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => void openSaved()}>
              Show saved transactions
            </Button>
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
      <Dialog open={showSaved} onOpenChange={setShowSaved}>
        <DialogContent className="flex max-h-[min(90vh,820px)] max-w-[min(96vw,88rem)] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Saved transactions</DialogTitle>
            <DialogDescription>Posted transactions kept in this app. This list is read-only.</DialogDescription>
          </DialogHeader>
          {savedError ? (
            <p className="text-sm text-muted-foreground">Could not load saved transactions.</p>
          ) : savedRows == null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : savedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved transactions yet.</p>
          ) : (
            <TransactionsTable rows={savedRows} readOnly containerClassName="max-h-[min(62vh,36rem)]" />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={confirmWipe} onOpenChange={setConfirmWipe}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete all locally saved transactions?</DialogTitle>
            <DialogDescription className="text-negative">
              Warning: This permanently deletes your local transaction history. Turning this feature back on will not recover transactions that exceed your financial institution&apos;s download limits.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" disabled={wiping} onClick={() => void wipeSaved()}>
              Delete all
            </Button>
            <Button type="button" variant="outline" disabled={wiping} onClick={() => setConfirmWipe(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
