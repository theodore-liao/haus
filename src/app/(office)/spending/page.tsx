import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { budgetAverages, ensureBudgets, spendMonthCount } from "@/lib/budgets";
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
  const budgets = await ensureBudgets(reports.flows);
  return (
    <>
      <PageHeader title="Spending" />
      <SpendingClient
        flows={reports.flows}
        recurring={reports.recurring}
        txns={txns}
        budgets={budgets}
        budgetChoices={budgetAverages(reports.flows)}
        spendMonths={spendMonthCount(reports.flows)}
      />
    </>
  );
}
