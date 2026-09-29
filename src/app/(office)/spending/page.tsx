import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { budgetAverages, ensureBudgets, spendMonthCount } from "@/lib/budgets";
import { getConnectionCount, getReports, getTransactions } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { preferredMonthChip } from "@/lib/month-pref";
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
          page="/spending"
          title="No spend yet"
          body="Link your cards and banks to see where your money goes."
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
        removedCount={reports.removedRecurring}
        txns={txns}
        budgets={budgets}
        budgetChoices={budgetAverages(reports.flows)}
        spendMonths={spendMonthCount(reports.flows)}
        archiveCoversFrom={reports.archiveCoversFrom}
        initialRange={await preferredMonthChip()}
      />
    </>
  );
}
