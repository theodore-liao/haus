import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInvestments } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvestmentsBoard } from "@/components/holdings-table";
import { TradesTable } from "@/components/trades-table";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const owner = await getOwnerFilter();
  const data = await getInvestments(owner);
  if (data.rows.length === 0) {
    return (
      <>
        <PageHeader title="Equities" />
        <EmptyLedger
          title="No equities"
          body="Link a brokerage to pull stock and ETF positions. Crypto wallets are under Cryptocurrencies."
        />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Equities" />
      <InvestmentsBoard rows={data.rows} />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Trades</CardTitle>
        </CardHeader>
        <CardContent className="max-h-56 overflow-hidden">
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="buy">Buys</TabsTrigger>
              <TabsTrigger value="sell">Sells</TabsTrigger>
              <TabsTrigger value="dividend">Dividends</TabsTrigger>
              <TabsTrigger value="cash">Contributions / cash</TabsTrigger>
              <TabsTrigger value="fee">Fees</TabsTrigger>
            </TabsList>
            {["all", "buy", "sell", "dividend", "cash", "fee"].map((k) => (
              <TabsContent key={k} value={k}>
                <TradesTable
                  rows={data.trades.filter((t) => {
                    if (k === "all") return true;
                    const blob = `${t.type} ${t.subtype ?? ""}`.toLowerCase();
                    return blob.includes(k) || (k === "cash" && (blob.includes("contribution") || blob.includes("transfer")));
                  })}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
