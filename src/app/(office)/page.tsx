import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Money } from "@/components/money";
import { HeroCard } from "@/components/hero-card";
import { Pills, Pill } from "@/components/pills";
import { ChartCard } from "@/components/chart-card";
import { AllocationChart, NetWorthChart } from "@/components/charts";
import { CashFlowBlock } from "@/components/cash-flow-block";
import { getOverview, getReports, hasAnyLedger } from "@/lib/queries";
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
          title="No institutions connected"
          body="Connect banks, brokerages, and retirement accounts to populate the household ledger. Balances, holdings, and history arrive from live links — nothing is invented."
        />
      </>
    );
  }

  const [data, reports] = await Promise.all([getOverview(owner), getReports(owner)]);
  const alloc = Object.entries(data.allocation).map(([key, value]) => ({
    key,
    value,
    items: data.allocationItems?.[key] ?? [],
  }));
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
            <Pill kicker="Equities" accent="#D4BE7A">
              <Money value={data.allocation.stocks + data.allocation.crypto + data.allocation.retirement} />
            </Pill>
            <Pill kicker="Cash" accent="#7DB8A4">
              <Money value={data.tiles.cash} />
            </Pill>
            <Pill kicker="Property" accent="#7EABD4">
              <Money value={data.tiles.realEstateGross} />
            </Pill>
            <Pill kicker="Liabilities" accent="#D4928C">
              <Money value={-Math.abs(data.tiles.liabilities)} />
            </Pill>
          </Pills>
        }
      >
        <Money value={data.netWorth} />
      </HeroCard>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <ChartCard kicker="Net worth">
          <NetWorthChart data={data.path} />
        </ChartCard>
        <ChartCard kicker="Allocation">
          <AllocationChart data={alloc} />
        </ChartCard>
      </div>
      {reports.flows.length > 0 ? (
        <CashFlowBlock flows={reports.flows} archiveCoversFrom={reports.archiveCoversFrom} />
      ) : null}
    </>
  );
}
