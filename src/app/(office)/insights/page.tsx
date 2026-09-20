import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { getConnectionCount, getInsights } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { InsightsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const owner = await getOwnerFilter();
  const connections = await getConnectionCount();
  if (!connections) {
    return (
      <>
        <PageHeader title="Insights" />
        <EmptyLedger
          title="No signals yet"
          body="Emergency-fund months appear after the first live sync, once cash and essential spending are in the ledger."
        />
      </>
    );
  }
  const data = await getInsights(owner);
  return (
    <>
      <PageHeader title="Insights" />
      <InsightsClient cards={data.cards} />
    </>
  );
}
