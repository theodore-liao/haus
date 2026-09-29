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
          page="/insights"
          title="No checkup yet"
          body="Link your bank and card accounts. After the first sync, Insights checks your cash, saving, debt, and investments against your targets."
          plaidReady={Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET)}
        />
      </>
    );
  }
  const data = await getInsights(owner);
  return (
    <>
      <PageHeader title="Insights" />
      <InsightsClient {...data} />
    </>
  );
}
