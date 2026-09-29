import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Money } from "@/components/money";
import { HeroCard } from "@/components/hero-card";
import { Pills, Pill } from "@/components/pills";
import { ChartCard } from "@/components/chart-card";
import { AllocationChart, NetWorthChart } from "@/components/charts";
import { CashFlowBlock } from "@/components/cash-flow-block";
import { getAttention, getOverview, getReports, getTransactions, hasAnyLedger } from "@/lib/queries";
import { BudgetCard } from "@/components/attention-card";
import { budgetOutlook } from "@/lib/attention";
import { listBudgets } from "@/lib/budgets";
import { readBudgetDismissed } from "@/lib/budget-dismissed";
import { overviewPillFigures } from "@/lib/overview-pills";
import { getOwnerFilter } from "@/lib/request";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const owner = await getOwnerFilter();
  const populated = await hasAnyLedger();
  if (!populated) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyLedger
          page="/"
          title="No institutions connected"
          body="Connect your banks, brokerages, and retirement accounts to see your balances and history."
        />
      </>
    );
  }

  const [data, reports, txns] = await Promise.all([
    getOverview(owner),
    getReports(owner),
    getTransactions(owner),
  ]);
  const [attention, budgets, dismissed] = await Promise.all([
    getAttention(reports.flows),
    listBudgets(),
    readBudgetDismissed(),
  ]);
  // Only a login the household can fix stays; sync trouble on our side is not theirs to act on.
  const notices = attention.flatMap((i) => (i.kind === "relink" ? [{ key: i.key, name: i.name }] : []));
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const budget = (
    <BudgetCard
      key="budget"
      rows={budgetOutlook(reports.flows, budgets, now)}
      dismissed={dismissed}
      daysLeft={lastDay - now.getDate() + 1}
      elapsed={now.getDate() / lastDay}
      notices={notices}
    />
  );
  const pills = overviewPillFigures({
    investments: data.tiles.investments,
    cash: data.tiles.cash,
    realEstate: data.tiles.realEstateGross,
    otherAssets: data.tiles.otherAssets,
    liabilities: data.tiles.liabilities,
  });
  const alloc = Object.entries(data.allocation).map(([key, value]) => ({
    key,
    value,
    items: data.allocationItems?.[key] ?? [],
  }));
  const netWorthRow = (
    <div key="net-worth" className="grid items-stretch gap-4 lg:grid-cols-2">
      <ChartCard kicker="Net worth">
        <NetWorthChart data={data.path} zeroBased={false} />
      </ChartCard>
      <ChartCard kicker="Allocation">
        <AllocationChart data={alloc} />
      </ChartCard>
    </div>
  );
  return (
    <>
      <PageHeader title="Overview" />

      <HeroCard
        kicker="Household net worth"
        supporting={
          <>
            Assets <Money value={data.netWorth + data.tiles.liabilities} /> − Liabilities{" "}
            <Money value={data.tiles.liabilities} />
          </>
        }
        deltas={[
          { label: "Day", value: data.dayChange },
          { label: "Week", value: data.weekChange },
          { label: "Month", value: data.monthChange },
        ]}
        aside={
          <Pills compact>
            <Pill kicker="Investments" accent="#D4BE7A">
              <Money value={pills.investments} />
            </Pill>
            <Pill kicker="Cash" accent="#7DB8A4">
              <Money value={pills.cash} />
            </Pill>
            <Pill kicker="Property" accent="#7EABD4">
              <Money value={pills.property} />
            </Pill>
            <Pill kicker="Liabilities" accent="#D4928C">
              <Money value={pills.liabilities} />
            </Pill>
          </Pills>
        }
      >
        <Money value={data.netWorth} />
      </HeroCard>

      {reports.flows.length > 0 ? (
        <CashFlowBlock
          flows={reports.flows}
          txns={txns}
          archiveCoversFrom={reports.archiveCoversFrom}
          between={netWorthRow}
          budget={budget}
        />
      ) : (
        <>
          {netWorthRow}
          <div className="relative min-h-[16rem]">{budget}</div>
        </>
      )}

    </>
  );
}
