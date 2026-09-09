import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Money } from "@/components/money";
import { getConnectionCount, getRetirement } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { IRS_LIMITS_YEAR } from "@/lib/constants";
import { Illustration } from "./illustration";
import { RetirementBoard } from "./board";
import { AddHsa } from "./hsa-form";

export const dynamic = "force-dynamic";

export default async function RetirementPage() {
  const owner = await getOwnerFilter();
  const connections = await getConnectionCount();
  const data = await getRetirement(owner);
  if (!connections && data.rows.length === 0) {
    return (
      <>
        <PageHeader title="Retirement" actions={<AddHsa names={data.names} />} />
        <EmptyLedger
          title="No retirement accounts"
          body="Link 401(k), IRA, Roth, 403(b), or HSA institutions. YTD contributions are summed from investment cashflows labeled as contributions."
        />
      </>
    );
  }

  const total = data.rows.reduce((s, r) => s + r.balance, 0);

  return (
    <>
      <PageHeader title="Retirement" actions={<AddHsa names={data.names} />} />
      <div className="mb-4 text-3xl font-medium">
        <Money value={total} />
        <span className="ml-2 text-sm font-normal text-muted-foreground">combined balances in this filter</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.rows.length === 0 ? (
          <EmptyLedger
            showConnect={false}
            title="Nothing classified as retirement"
            body="Open Settings → Connections and mark the account as IRA, Roth, 401(k), 403(b), or HSA."
          />
        ) : (
          <div className="md:col-span-2">
            <RetirementBoard rows={data.rows} />
          </div>
        )}
      </div>
      <Illustration starting={total} />
      <p className="mt-4 text-xs text-muted-foreground">
        {IRS_LIMITS_YEAR} catch-up (not applied automatically): IRA +$1,100 (50+); 401(k)/403(b) +$8,000 (50+) or +$11,250
        (60–63); HSA +$1,000 (55+). Family HSA limit shown for HSA accounts.
      </p>
    </>
  );
}
