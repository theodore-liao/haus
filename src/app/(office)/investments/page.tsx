import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { getInvestments, getOverview } from "@/lib/queries";
import { reconstructStocksPath } from "@/lib/history";
import { getOwnerFilter } from "@/lib/request";
import { loadPriceMap } from "@/lib/quotes";
import { fillMoverWindows } from "@/lib/period-moves";
import { TradesCard } from "@/components/trades-table";
import { InvestmentsDesk } from "./desk";
import { ManualEntryControls, type ManualStock } from "@/components/manual-stocks";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const owner = await getOwnerFilter();
  const [data, overview] = await Promise.all([getInvestments(owner), getOverview(owner)]);
  // Overview fills in recent daily closes. The chart reads those, so it runs after.
  const path = await reconstructStocksPath(owner).catch(() => []);
  const manuals = data.manuals as ManualStock[];
  // 1D, 1W and 1M are today's holding against past closes, so no window is left empty.
  const now = new Date();
  const lastBySymbol = new Map<string, number>();
  for (const r of data.rows) if (r.symbol && r.last != null && r.last > 0) lastBySymbol.set(r.symbol.toUpperCase(), r.last);
  const closes = lastBySymbol.size
    ? await loadPriceMap([...lastBySymbol.keys()], new Date(now.getTime() - 45 * 86_400_000), now).catch(() => new Map<string, number>())
    : new Map<string, number>();
  const movers = fillMoverWindows(overview.movers, lastBySymbol, closes, now);
  return (
    <>
      <PageHeader title="Stocks" />
      {data.rows.length === 0 && manuals.length === 0 ? (
        <>
          <div className="mb-4 flex justify-end">
            <ManualEntryControls names={data.names} rows={[]} />
          </div>
          <EmptyLedger
          page="/investments"
            title="No brokerage holdings"
            body={
              data.names.tabs.crypto
                ? "Link a brokerage to pull stock and ETF positions. Retirement accounts are under Retirement; crypto wallets are under Crypto."
                : "Link a brokerage to pull stock and ETF positions. Retirement accounts are under Retirement."
            }
            plaidReady={Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET)}
          />
        </>
      ) : (
        <InvestmentsDesk
          names={data.names}
          manuals={manuals}
          rows={data.rows}
          movers={movers}
          path={path}
        />
      )}
      {data.rows.length > 0 ? <TradesCard trades={data.trades} /> : null}
    </>
  );
}
