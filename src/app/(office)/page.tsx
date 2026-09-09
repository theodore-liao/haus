import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectPlaid } from "@/components/connect-plaid";
import { Money } from "@/components/money";
import { NetWorthHero } from "@/components/net-worth-hero";
import { AllocationChart, NetWorthChart } from "@/components/charts";
import { getOverview, hasAnyLedger } from "@/lib/queries";
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

  const data = await getOverview(owner);
  const alloc = Object.entries(data.allocation).map(([key, value]) => ({
    key,
    value,
    items: data.allocationItems?.[key] ?? [],
  }));
  return (
    <>
      <PageHeader title="Overview" actions={<ConnectPlaid label="Add institution" />} />

      <NetWorthHero
        netWorth={data.netWorth}
        assets={data.netWorth + data.tiles.liabilities}
        liabilities={data.tiles.liabilities}
        dayChange={data.dayChange}
        weekChange={data.weekChange}
        monthChange={data.monthChange}
        movers={data.movers}
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Investments" value={data.tiles.investments} accent="#cbb892" />
        <Tile label="Cash" value={data.tiles.cash} accent="#6fc4b0" />
        <Tile label="Real estate" value={data.tiles.realEstateEquity} accent="#7eb6e0" />
        <Tile label="Liabilities" value={data.tiles.liabilities} negative accent="#d48992" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Net worth</CardTitle>
          </CardHeader>
          <CardContent>
            <NetWorthChart data={data.path} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationChart data={alloc} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Tile({
  label,
  value,
  negative,
  accent,
}: {
  label: string;
  value: number;
  negative?: boolean;
  accent: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
      <CardHeader>
        <CardTitle className="text-sm tracking-[0.08em]">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-medium tracking-tight">
          <Money value={negative ? -Math.abs(value) : value} />
        </div>
      </CardContent>
    </Card>
  );
}

