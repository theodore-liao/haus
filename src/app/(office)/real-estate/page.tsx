import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { getRealEstate } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { formatDate, formatPct } from "@/lib/format";
import { ownerLabel } from "@/lib/owners";
import { PropertyForm } from "./form";

export const dynamic = "force-dynamic";

export default async function RealEstatePage() {
  const owner = await getOwnerFilter();
  const data = await getRealEstate(owner);
  const totalEst = data.rows.reduce((s, r) => s + r.estimate, 0);
  const totalEq = data.rows.reduce((s, r) => s + r.equity, 0);

  return (
    <>
      <PageHeader title="Real Estate" actions={<PropertyForm names={data.names} />} />
      {data.rows.length === 0 ? (
        <EmptyLedger
          showConnect={false}
          title="No properties on the ledger"
          body="Add a residence or rental with market value and remaining mortgage. Equity and LTV are value minus that debt."
        />
      ) : (
        <>
          <div className="mb-4 flex gap-8">
            <div>
              <div className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">Gross estimate</div>
              <div className="text-2xl">
                <Money value={totalEst} />
              </div>
            </div>
            <div>
              <div className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">Equity</div>
              <div className="text-2xl">
                <Money value={totalEq} />
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {data.rows.map((p) => (
              <Card key={p.id}>
                <CardHeader>
                  <CardTitle>{ownerLabel(p.owner, data.names)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-medium">{p.label}</div>
                  {p.address ? <div className="text-sm text-muted-foreground">{p.address}</div> : null}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <Field k="Market value" v={<Money value={p.estimate} />} />
                    <Field k="As of" v={formatDate(p.asOfDate)} />
                    <Field k="Mortgage" v={p.loanName ?? "None"} />
                    <Field k="Loan balance" v={<Money value={p.loanBalance} />} />
                    <Field k="Equity" v={<Money value={p.equity} />} />
                    <Field k="LTV" v={p.ltv == null ? "—" : formatPct(p.ltv * 100, 1, false)} />
                    <Field k="Rate" v={p.rate == null ? "—" : `${p.rate.toFixed(3)}%`} />
                    <Field k="Term" v={p.termMonths ? `${Math.round(p.termMonths / 12)} yr` : "—"} />
                    <Field k="PITI" v={<Money value={p.piti} />} />
                    <Field k="Rent" v={<Money value={p.rent} />} />
                  </div>
                  <div className="mt-3">
                    <PropertyForm
                      names={data.names}
                      existing={{
                        id: p.id,
                        label: p.label,
                        address: p.address ?? "",
                        estimate: p.estimate,
                        asOfDate: p.asOfDate.toISOString().slice(0, 10),
                        owner: p.owner,
                        mortgageBalance: p.mortgageBalance,
                        rate: p.rate,
                        termMonths: p.termMonths,
                        piti: p.piti,
                        rent: p.rent,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{k}</div>
      <div>{v}</div>
    </div>
  );
}
