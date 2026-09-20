import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { getConnectionCount, getRetirement } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { IRS_LIMITS_YEAR } from "@/lib/constants";
import { hausTypeLabel, isChildAccountType } from "@/lib/account-types";
import { RetirementBoard } from "./board";
import { AddHsa } from "./hsa-form";
import { ChildrenForms } from "../children/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";

export const dynamic = "force-dynamic";

export default async function RetirementPage() {
  const owner = await getOwnerFilter();
  const connections = await getConnectionCount();
  const data = await getRetirement(owner);
  const custodial = data.rows.filter((r) => isChildAccountType(r.kind));
  const retirement = data.rows.filter((r) => !isChildAccountType(r.kind));
  if (!connections && data.rows.length === 0) {
    return (
      <>
        <PageHeader
          title="Retirement"
          actions={
            <>
              <AddHsa names={data.names} />
              <ChildrenForms names={data.names} />
            </>
          }
        />
        <EmptyLedger
          title="No retirement accounts"
          body="Link 401(k), IRA, Roth, 403(b), or HSA institutions. YTD contributions are summed from investment cashflows labeled as contributions."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Retirement"
        actions={
          <>
            <AddHsa names={data.names} />
            <ChildrenForms names={data.names} actions="child" />
          </>
        }
      />
      {retirement.length === 0 ? (
        <EmptyLedger
          showConnect={false}
          title="Nothing classified as retirement"
          body="Open Connections and mark the account as IRA, Roth, 401(k), 403(b), or HSA."
        />
      ) : (
        <RetirementBoard
          rows={retirement}
          today={new Date().toISOString().slice(0, 10)}
          holders={[
            { key: "A", name: data.names.nameA, birthdate: data.names.birthdateA },
            { key: "B", name: data.names.nameB, birthdate: data.names.birthdateB },
          ]}
        />
      )}
      <Card>
          <CardHeader row>
            <CardTitle>Children</CardTitle>
            <ChildrenForms names={data.names} actions="entry" />
          </CardHeader>
          <CardContent className="space-y-3">
            {custodial.length === 0 ? (
              <p className="text-sm text-muted-foreground">No child accounts yet.</p>
            ) : (
              custodial.map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0">
                  <div className="cell-stack text-sm">
                    <span>{m.name}</span>
                    <span>
                      {hausTypeLabel(m.kind)}
                      {m.childLabel ? ` · ${m.childLabel}` : " · No child assigned"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Money value={m.balance} />
                    {m.manual ? (
                      <ChildrenForms
                        names={data.names}
                        existing={{
                          id: m.id,
                          hausType: m.kind,
                          name: m.name,
                          owner: m.owner,
                          beneficiary: m.beneficiary ?? "",
                          balance: m.balance,
                          asOfDate: new Date().toISOString().slice(0, 10),
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
      </Card>
      <p className="footnote max-w-4xl">
        {IRS_LIMITS_YEAR} catch-up (not applied automatically): IRA +$1,100 (50+); 401(k)/403(b) +$8,000 (50+) or +$11,250
        (60–63); HSA +$1,000 (55+). Family HSA limit shown for HSA accounts.
      </p>
    </>
  );
}
