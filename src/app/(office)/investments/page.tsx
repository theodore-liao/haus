import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInvestments, getOverview } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TradesTable } from "@/components/trades-table";
import { InvestmentsDesk } from "./desk";
import { ManualEntryControls, type ManualStock } from "@/components/manual-stocks";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const owner = await getOwnerFilter();
  const [data, overview] = await Promise.all([getInvestments(owner), getOverview(owner)]);
  const manuals = data.manuals as ManualStock[];
  return (
    <>
      <PageHeader title="Stocks" />
      {data.rows.length === 0 && manuals.length === 0 ? (
        <>
          <div className="mb-4 flex justify-end">
            <ManualEntryControls names={data.names} rows={[]} />
          </div>
          <EmptyLedger
            title="No brokerage holdings"
            body="Link a brokerage to pull stock and ETF positions. Retirement accounts are under Retirement; crypto wallets are under Crypto."
          />
        </>
      ) : (
        <InvestmentsDesk names={data.names} manuals={manuals} rows={data.rows} movers={overview.movers} />
      )}
      {data.rows.length > 0 ? (
        <Card>
          <Tabs defaultValue="all">
            <CardHeader row className="pb-3">
              <CardTitle>Trades</CardTitle>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="buy">Buys</TabsTrigger>
                <TabsTrigger value="sell">Sells</TabsTrigger>
                <TabsTrigger value="dividend">Dividends</TabsTrigger>
                <TabsTrigger value="cash">Contributions / cash</TabsTrigger>
                <TabsTrigger value="fee">Fees</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="px-0 pb-0 pt-0">
              {["all", "buy", "sell", "dividend", "cash", "fee"].map((k) => (
                <TabsContent key={k} value={k} className="mt-0">
                  <TradesTable
                    rows={data.trades.filter((t) => {
                      if (k === "all") return true;
                      const blob = `${t.type} ${t.subtype ?? ""}`.toLowerCase();
                      return blob.includes(k) || (k === "cash" && (blob.includes("contribution") || blob.includes("transfer")));
                    })}
                  />
                </TabsContent>
              ))}
            </CardContent>
          </Tabs>
        </Card>
      ) : null}
    </>
  );
}
