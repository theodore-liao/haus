"use client";

import { useRouter } from "next/navigation";
import { ConnectPlaid } from "@/components/connect-plaid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Callout } from "@/components/callout";
import { InfoTip } from "@/components/info-tip";
import { Money } from "@/components/money";
import { formatDateTime } from "@/lib/format";
import {
  TAX_TREATMENTS,
  hasTaxTreatment,
  hausTypeLabel,
  isLiabilityType,
  isRetirementType,
  taxTreatmentOf,
} from "@/lib/account-types";
import { ownerOptions, ownerLabel } from "@/lib/owners";
import { BrandLabel } from "@/components/brand-mark";

const STALE_HOURS = 48;

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
    balance: number | null;
  }[];
};

function isStale(item: ConnectionItem, now: number) {
  return item.status === "good" && item.lastSyncedAt != null && now - Date.parse(item.lastSyncedAt) > STALE_HOURS * 3_600_000;
}

export function ConnectionsPanel({
  plaidReady,
  items,
  names,
  now,
}: {
  plaidReady: boolean;
  items: ConnectionItem[];
  names: {
    nameA: string;
    nameB: string;
    children: { id: string; name: string }[];
  };
  /** Server time, so the stale check matches Overview's. */
  now: number;
}) {
  const router = useRouter();
  const opts = ownerOptions(names);
  const broken = items.filter((i) => i.status !== "good");
  const stale = items.filter((i) => isStale(i, now));
  const latest = items.reduce<string | null>((m, i) => (i.lastSyncedAt && (!m || i.lastSyncedAt > m) ? i.lastSyncedAt : m), null);
  const accountCount = items.reduce((s, i) => s + i.accounts.length, 0);

  async function patch(id: string, body: Record<string, unknown>, what: string) {
    const res = await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      toast.error(`Could not change the ${what}.`);
      return;
    }
    router.refresh();
  }

  type Row = ConnectionItem["accounts"][number];
  const ownerSelect = (a: Row) => (
    <Select value={a.owner} onValueChange={(v) => void patch(a.id, { owner: v }, "owner")}>
      <SelectTrigger className="h-8 text-xs" aria-label={`Who ${a.name} belongs to`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const taxSelect = (a: Row) => (
    <Select
      value={taxTreatmentOf(a)}
      onValueChange={(v) =>
        void patch(
          a.id,
          {
            hausType: v,
            isRetirement: isRetirementType(v),
            retirementKind: isRetirementType(v) ? v : null,
          },
          "tax treatment",
        )
      }
    >
      <SelectTrigger className="h-8 text-xs" aria-label={`How ${a.name} is taxed`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TAX_TREATMENTS.map((t) => (
          <SelectItem key={t.value} value={t.value}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card>
      <CardHeader row>
        <div className="flex items-baseline gap-2">
          <CardTitle>Connections</CardTitle>
          <span className="text-xs font-normal normal-case tracking-normal text-muted-foreground tabular-nums">
            {items.length} {items.length === 1 ? "institution" : "institutions"} · {accountCount}{" "}
            {accountCount === 1 ? "account" : "accounts"}
          </span>
        </div>
        <ConnectPlaid label="Add institution" disabled={!plaidReady} />
      </CardHeader>
      <CardContent className="space-y-6">
        {broken.length ? (
          <Callout tone="bad">
            {broken.map((i) => i.institutionName ?? "A connection").join(", ")} {broken.length === 1 ? "needs" : "need"}{" "}
            relinking. Balances there stop updating until you do.
          </Callout>
        ) : stale.length ? (
          <Callout tone="warn">
            {stale.map((i) => i.institutionName ?? "A connection").join(", ")} {stale.length === 1 ? "has" : "have"} not synced in
            two days. Press Refresh all in Settings, or relink.
          </Callout>
        ) : (
          <Callout tone="good">All connections are working. Last synced {formatDateTime(latest)}.</Callout>
        )}
        {!plaidReady ? (
          <Callout tone="info">
            <span className="inline-flex items-center gap-1">
              Bank linking isn&apos;t set up on this computer, so new banks can&apos;t be added.
              <InfoTip label="How to set up bank linking">
                Add PLAID_CLIENT_ID and PLAID_SECRET to the .env file, then restart Haus.
              </InfoTip>
            </span>
          </Callout>
        ) : null}

        {items.map((item) => {
          const bad = item.status !== "good";
          const old = isStale(item, now);
          return (
            <section key={item.id} className="border-t border-border pt-5 first-of-type:border-0 first-of-type:pt-0">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                  <div className="text-sm font-medium">
                    <BrandLabel className="flex w-full max-w-full" kind="institution" name={item.institutionName}>
                      {item.institutionName ?? "Institution"}
                    </BrandLabel>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Synced {formatDateTime(item.lastSyncedAt)}
                    <span className="hidden sm:inline"> · new accounts go to {ownerLabel(item.defaultOwner, names)}</span>
                  </div>
                </div>
                <div className="-ml-3 flex items-center gap-1 sm:ml-0">
                  {bad ? (
                    <Badge tone="negative">{item.status === "relink" ? "Needs relink" : "Sync error"}</Badge>
                  ) : old ? (
                    <Badge tone="accent">Not synced in 2 days</Badge>
                  ) : null}
                  <ConnectPlaid label="Relink" itemId={item.id} relink variant={bad ? "default" : "ghost"} />
                  <ConfirmButton
                    title={`Remove ${item.institutionName ?? "this institution"}?`}
                    description="Its accounts, balances, and holdings leave Haus. Saved transaction history stays."
                    onConfirm={async () => {
                      const res = await fetch(`/api/plaid/items/${item.id}`, {
                        method: "DELETE",
                      });
                      if (!res.ok) {
                        toast.error("Could not remove this connection.");
                        return;
                      }
                      router.refresh();
                    }}
                  >
                    Remove
                  </ConfirmButton>
                </div>
              </div>
              {item.errorMessage ? <p className="mt-2 text-xs text-negative">{connectionError(item.errorMessage)}</p> : null}
              <div className="-mx-[var(--space-card)] mt-3 overflow-hidden">
                <table className="data-table table-fixed">
                  <thead>
                    <tr className="kicker">
                      <th>Account</th>
                      <th className="num hidden w-[9.5rem] sm:table-cell">Balance</th>
                      <th className="hidden w-[9.5rem] sm:table-cell">Belongs to</th>
                      <th className="hidden w-[11rem] md:table-cell">Tax treatment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.accounts.map((a) => {
                      const owes = isLiabilityType(a.hausType);
                      return (
                        <tr key={a.id} className="border-t border-border">
                          <td>
                            <div className="cell-stack">
                              <span title={a.name}>{a.name}</span>
                              <span>
                                {hausTypeLabel(a.hausType)}
                                {a.mask ? ` · ••${a.mask}` : ""}
                                {a.balance != null ? (
                                  <span className="sm:hidden">
                                    {" · "}
                                    <Money value={owes ? -Math.abs(a.balance) : a.balance} />
                                  </span>
                                ) : null}
                              </span>
                            </div>
                            <div className="mt-2 grid gap-2 sm:hidden">
                              <div>
                                <div className="footnote mb-1">Belongs to</div>
                                {ownerSelect(a)}
                              </div>
                              {hasTaxTreatment(a.hausType) ? (
                                <div>
                                  <div className="footnote mb-1">Tax treatment</div>
                                  {taxSelect(a)}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="num hidden sm:table-cell">
                            {a.balance == null ? (
                              "—"
                            ) : (
                              <Money
                                value={owes ? -Math.abs(a.balance) : a.balance}
                                className={owes ? "text-muted-foreground" : undefined}
                              />
                            )}
                          </td>
                          <td className="hidden sm:table-cell">
                            {ownerSelect(a)}
                            {hasTaxTreatment(a.hausType) ? (
                              <div className="mt-2 md:hidden">
                                <div className="footnote mb-1">Tax treatment</div>
                                {taxSelect(a)}
                              </div>
                            ) : null}
                          </td>
                          <td className="hidden md:table-cell">
                            {hasTaxTreatment(a.hausType) ? taxSelect(a) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
