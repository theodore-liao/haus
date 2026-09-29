import { PageHeader } from "@/components/page-header";
import { getInsights, getNames, getReports } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { listBudgets } from "@/lib/budgets";
import { budgetTracker } from "@/lib/budget-tracker";
import { GoalsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const owner = await getOwnerFilter();
  const now = new Date();
  const [insights, reports, budgets, names] = await Promise.all([getInsights(owner), getReports(owner), listBudgets(), getNames()]);

  const tracker = budgetTracker(reports.flows, budgets, now);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  return (
    <>
      <PageHeader title="Goals" />
      <GoalsClient
        tracker={tracker}
        monthBudget={budgets.reduce((s, b) => s + Math.max(0, b.monthly), 0)}
        daysLeft={Math.max(0, last - now.getDate() + 1)}
        reserve={insights.insights.find((i) => i.id === "reserve") ?? null}
        retirement={insights.insights.find((i) => i.id === "retirement") ?? null}
        retirementOn={names.tabs.retirement}
      />
    </>
  );
}
