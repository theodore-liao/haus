"use client";

import { useRouter } from "next/navigation";
import { ConnectPlaid } from "@/components/connect-plaid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { hausTypeLabel } from "@/lib/account-types";
import { ownerOptions, ownerLabel } from "@/lib/owners";
import { BrandLabel } from "@/components/brand-mark";

function connectionError(message: string) {
  if (/unsupported state or unable to authenticate data/i.test(message) || /cannot decrypt plaid token/i.test(message)) {
    return "Stored Plaid token can’t be decrypted with the current HAUS_TOKEN_KEY. Relink this same connection (does not use a new Trial slot) or restore the original key. Last good data stays on the ledger.";
  }
  return message;
}

export type ConnectionItem = {
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

export function ConnectionsPanel({
  plaidReady,
  items,
  names,
}: {
  plaidReady: boolean;
  items: ConnectionItem[];
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
}) {
  const router = useRouter();
  const opts = ownerOptions(names);

  return (
    <Card>
      <CardHeader row>
        <div className="flex items-baseline gap-2">
          <CardTitle>Connections</CardTitle>
          <span className="text-xs font-normal normal-case tracking-normal text-muted-foreground tabular-nums">
            {items.length}
          </span>
        </div>
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
                    Last sync {formatDateTime(item.lastSyncedAt)} · default holder {ownerLabel(item.defaultOwner, names)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={item.status === "good" ? "positive" : item.status === "relink" ? "negative" : "accent"}>
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
              {item.errorMessage ? <p className="mt-2 text-xs text-negative">{connectionError(item.errorMessage)}</p> : null}
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
  );
}
