import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { getConnectionCount, getTransactions } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { TransactionsTable } from "./table";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { q } = await searchParams;
  const owner = await getOwnerFilter();
  const connections = await getConnectionCount();
  if (!connections) {
    return (
      <>
        <PageHeader title="Transactions" />
        <EmptyLedger
          page="/transactions"
          title="No transactions"
          body="Connect institutions with the Transactions product. Haus stores the full available history and never asks for a spreadsheet."
        />
      </>
    );
  }
  const rows = await getTransactions(owner);
  return (
    <>
      <PageHeader title="Transactions" />
      <TransactionsTable rows={rows} dateChips initialQuery={typeof q === "string" ? q.trim() : ""} />
    </>
  );
}
