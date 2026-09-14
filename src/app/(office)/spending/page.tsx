import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { getConnectionCount, getReports, getTransactions } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { SpendingClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SpendingPage() {
  const owner = await getOwnerFilter();
  const connections = await getConnectionCount();
  if (!connections) {
    return (
      <>
        <PageHeader title="Spending" />
        <EmptyLedger
          title="No spend yet"
          body="Link cards and banks. Spending is built from the ledger, not a spreadsheet."
        />
      </>
    );
  }
  const [reports, txns] = await Promise.all([getReports(owner), getTransactions(owner)]);
  return (
    <>
      <PageHeader title="Spending" />
      <SpendingClient
        flows={reports.flows}
        recurring={reports.recurring}
        txns={txns.filter((t) => t.amount > 0 && !t.isTransfer && !t.isCcPayment)}
      />
    </>
  );
}
