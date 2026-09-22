import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { getInvestments, getOverview } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { TradesCard } from "@/components/trades-table";
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
      {data.rows.length > 0 ? <TradesCard trades={data.trades} /> : null}
    </>
  );
}
