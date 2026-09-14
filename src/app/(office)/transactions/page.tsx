import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { getConnectionCount, getTransactions } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { TransactionsTable } from "./table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const owner = await getOwnerFilter();
  const connections = await getConnectionCount();
  if (!connections) {
    return (
      <>
        <PageHeader title="Manage transactions" />
        <EmptyLedger
          title="No transactions"
          body="Connect institutions with the Transactions product. Haus stores the full available history and never asks for a spreadsheet."
        />
      </>
    );
  }
  const rows = await getTransactions(owner);
  return (
    <>
      <PageHeader
        title="Manage transactions"
        actions={
          <Button variant="outline" size="sm" asChild>
            <a href="/api/export/transactions">Download view</a>
          </Button>
        }
      />
      <TransactionsTable rows={rows} />
    </>
  );
}
