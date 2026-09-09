"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConnectPlaid } from "@/components/connect-plaid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { hausTypeLabel } from "@/lib/account-types";
import { ownerOptions, ownerLabel } from "@/lib/owners";
import { BrandLabel } from "@/components/brand-mark";
import { UiScaleSlider } from "@/components/ui-scale";

type Item = {
  id: string;
  institutionName: string | null;
  status: string;
  errorMessage: string | null;
  lastSyncedAt: string | null;
  defaultOwner: string;
  accounts: {
    id: string;
    name: string;
    mask: string | null;
    hausType: string;
    owner: string;
    isRetirement: boolean;
    retirementKind: string | null;
  }[];
};

export function SettingsClient({
  nameA,
  nameB,
  plaidReady,
  items,
  names,
}: {
  nameA: string;
  nameB: string;
  plaidReady: boolean;
  items: Item[];
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
}) {
  const router = useRouter();
  const [t, setT] = useState(nameA);
  const [j, setJ] = useState(nameB);
  const opts = ownerOptions(names);

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
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Connections</CardTitle>
          <ConnectPlaid label="Add institution" />
        </CardHeader>
        <CardContent className="space-y-6">
          {!plaidReady && (
            <p className="text-sm text-muted-foreground">
              Add PLAID_CLIENT_ID and PLAID_SECRET to .env, then restart. Sandbox logins are live connections, not a demo
              household.
            </p>
          )}
          {plaidReady && (
            <p className="text-sm text-muted-foreground">
              One Link session covers banks, cards, and brokerages. Chase starts with no accounts selected — check every
              account you want included.
            </p>
          )}
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items linked.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="border-b border-border pb-5 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      <BrandLabel kind="institution" name={item.institutionName}>
                        {item.institutionName ?? "Institution"}
                      </BrandLabel>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Last sync {formatDateTime(item.lastSyncedAt)} · default {ownerLabel(item.defaultOwner, names)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={item.status === "good" ? "positive" : item.status === "relink" ? "negative" : "accent"}
                    >
                      {item.status}
                    </Badge>
                    <ConnectPlaid label="Relink" itemId={item.id} relink />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await fetch(`/api/plaid/items/${item.id}`, { method: "DELETE" });
                        router.refresh();
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
                {item.errorMessage ? <p className="mt-2 text-xs text-negative">{item.errorMessage}</p> : null}
                <div className="mt-3 space-y-2">
                  {item.accounts.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        {a.name}
                        {a.mask ? <span className="text-muted-foreground"> · {a.mask}</span> : null}
                        <span className="text-muted-foreground"> · {hausTypeLabel(a.hausType)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <select
                          className="h-8 rounded-md border border-border bg-card px-2 text-xs"
                          defaultValue={a.owner}
                          onChange={async (e) => {
                            await fetch(`/api/accounts/${a.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ owner: e.target.value }),
                            });
                            router.refresh();
                          }}
                        >
                          {opts.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <select
                          className="h-8 rounded-md border border-border bg-card px-2 text-xs"
                          defaultValue={a.retirementKind ?? (a.isRetirement ? a.hausType : "")}
                          onChange={async (e) => {
                            const v = e.target.value;
                            await fetch(`/api/accounts/${a.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                isRetirement: Boolean(v),
                                retirementKind: v || null,
                                hausType: v || undefined,
                              }),
                            });
                            router.refresh();
                          }}
                        >
                          <option value="">Not retirement</option>
                          <option value="ira">IRA</option>
                          <option value="roth">Roth</option>
                          <option value="401k">401(k)</option>
                          <option value="403b">403(b)</option>
                          <option value="hsa">HSA</option>
                        </select>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
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
