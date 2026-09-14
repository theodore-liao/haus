import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { getChildrenView } from "@/lib/queries";
import { hausTypeLabel } from "@/lib/account-types";
import { accountLabel } from "@/lib/account-label";
import { formatDate } from "@/lib/format";
import { givenName, ownerLabel } from "@/lib/owners";
import { BrandLabel } from "@/components/brand-mark";
import { ChildrenForms } from "./forms";

export const dynamic = "force-dynamic";

export default async function ChildrenPage() {
  const data = await getChildrenView();
  const ytdByAccount: Record<string, number> = {};
  for (const t of data.contribs) {
    const sub = (t.subtype || "").toLowerCase();
    if (sub.includes("contribution") || t.type === "cash") {
      ytdByAccount[t.accountId] = (ytdByAccount[t.accountId] ?? 0) + Math.abs(t.amount);
    }
  }

  return (
    <>
      <PageHeader title="Children" actions={<ChildrenForms names={data.names} />} />
      {data.names.children.length === 0 && data.accounts.length === 0 && data.manuals.length === 0 ? (
        <EmptyLedger
          showConnect={false}
          title="No child accounts"
          body="Add a child, then assign 529, UTMA, or Trump Accounts to them after linking. If the plan is not available through Plaid, record a manual balance here."
        />
      ) : (
        <div className="space-y-4">
          {data.names.children.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {data.names.children.map((c) => givenName(c.name) || c.name).join(" · ")}
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {data.accounts.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle>{hausTypeLabel(a.hausType)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg">
                    <BrandLabel kind="institution" name={a.item.institutionName}>
                      {accountLabel(a.name, a.item.institutionName)}
                    </BrandLabel>
                  </div>
                  <div className="text-xs text-muted-foreground">{ownerLabel(a.owner, data.names)}</div>
                  <div className="mt-3 text-2xl">
                    <Money value={a.currentBalance} />
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    YTD contributions <Money value={ytdByAccount[a.id] ?? 0} className="text-sm" />
                  </div>
                </CardContent>
              </Card>
            ))}
            {data.manuals.map((m) => (
              <Card key={m.id}>
                <CardHeader>
                  <CardTitle>{hausTypeLabel(m.hausType)} (manual add)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Beneficiary {m.beneficiary ?? "—"} · {ownerLabel(m.owner, data.names)} · as of{" "}
                    {formatDate(m.asOfDate)}
                  </div>
                  <div className="mt-3 text-2xl">
                    <Money value={m.balance} />
                  </div>
                  <div className="mt-3">
                    <ChildrenForms
                      names={data.names}
                      existing={{
                        id: m.id,
                        hausType: m.hausType,
                        name: m.name,
                        owner: m.owner,
                        beneficiary: m.beneficiary ?? "",
                        balance: m.balance,
                        asOfDate: m.asOfDate.toISOString().slice(0, 10),
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
