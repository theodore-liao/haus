import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { getConnectionCount, getReports, getTransactions } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { TransactionsView } from "./client";

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
          body="Connect your banks and cards to see every transaction here."
        />
      </>
    );
  }
  const [rows, reports] = await Promise.all([getTransactions(owner), getReports(owner)]);
  return (
    <>
      <PageHeader title="Transactions" />
      <TransactionsView rows={rows} recurring={reports.recurring} initialQuery={typeof q === "string" ? q.trim() : ""} />
    </>
  );
}
