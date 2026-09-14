import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getInvestments, getOverview } from "@/lib/queries";
import { LargestMoves } from "@/components/largest-moves";
import { getOwnerFilter } from "@/lib/request";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvestmentsBoard } from "@/components/holdings-table";
import { TradesTable } from "@/components/trades-table";
import { ManualStockBox, type ManualStock } from "@/components/manual-stocks";
import { FIXED_USD_ID } from "@/lib/constants";
import type { HoldingRow } from "@/components/holdings-table";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const owner = await getOwnerFilter();
  const [data, overview] = await Promise.all([getInvestments(owner), getOverview(owner)]);
  const manuals = data.manuals as ManualStock[];
  const manualRows: HoldingRow[] = manuals.map((h) => ({
    id: h.id,
    symbol: h.coingeckoId === FIXED_USD_ID ? null : h.symbol,
    name: h.name,
    class: h.assetClass || "equity",
    account: h.accountName || "Manual",
    institution: h.accountName || "Manual",
    ownerLabel: h.ownerLabel,
    qty: h.coingeckoId === FIXED_USD_ID ? 0 : h.quantity,
    last: h.coingeckoId === FIXED_USD_ID ? null : h.quotePrice,
    value: h.coingeckoId === FIXED_USD_ID ? (h.quotePrice ?? 0) : (h.quotePrice ?? 0) * h.quantity,
    costBasis: null,
    dayPl: null,
    totalPl: null,
    dayPct: null,
    weight: 0,
    manual: true,
    accounts: [h.accountName || "Manual"],
    brandKind: "security",
  }));
  const donutRows = [...manualRows, ...data.rows];
  const manualBox = <ManualStockBox key="manual-entries" names={data.names} rows={manuals} />;
  return (
    <>
      <PageHeader title="Stocks" />
      {donutRows.length === 0 ? (
        <>
          {manualBox}
          <EmptyLedger
            title="No brokerage holdings"
            body="Link a brokerage to pull stock and ETF positions. Retirement accounts are under Retirement; crypto wallets are under Cryptocurrencies."
          />
        </>
      ) : (
        <InvestmentsBoard
          rows={donutRows}
          tableRows={donutRows}
          accountOnly
          besideAccount={<LargestMoves movers={overview.movers} />}
          beforeTable={manualBox}
          headerAction={
            <Button type="button" size="sm" variant="outline" asChild>
              <a href="/connections">Add connection</a>
            </Button>
          }
        />
      )}
      {data.rows.length > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Trades</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[28rem] overflow-auto">
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
      ) : null}
    </>
  );
}
