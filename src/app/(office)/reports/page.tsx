import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { getReports } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { ReportsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const owner = await getOwnerFilter();
  const data = await getReports(owner);
  return (
    <>
      <PageHeader title="Reports" />
      {data.months.length === 0 ? (
        <EmptyLedger
          title="Nothing to report"
          body="Reports need bank and card transactions. Link an institution, then pick a window."
        />
      ) : (
        <ReportsClient months={data.months} recurring={data.recurring} />
      )}
    </>
  );
}
