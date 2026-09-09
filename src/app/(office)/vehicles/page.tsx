import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { prisma } from "@/lib/db";
import { getNames } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { matchesOwner, ownerLabel } from "@/lib/owners";
import { formatDate, formatPct } from "@/lib/format";
import { vehicleDebt } from "@/lib/property";
import { VehicleForm } from "./form";

export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  const owner = await getOwnerFilter();
  const names = await getNames();
  const vehicles = (await prisma.vehicle.findMany({ orderBy: { createdAt: "asc" } })).filter((v) =>
    matchesOwner(v.owner, owner),
  );
  const rows = vehicles.map((v) => {
    const loanBalance = (v as { loanBalance?: number | null }).loanBalance ?? null;
    const debt = vehicleDebt({ ...v, loanBalance }, []);
    const equity = v.estimate - debt;
    return { ...v, loanBalance, debt, equity, ltv: v.estimate > 0 ? debt / v.estimate : null };
  });
  const totalEst = rows.reduce((s, r) => s + r.estimate, 0);
  const totalEq = rows.reduce((s, r) => s + r.equity, 0);

  return (
    <>
      <PageHeader title="Vehicles" actions={<VehicleForm names={names} />} />
      {rows.length === 0 ? (
        <EmptyLedger
          showConnect={false}
          title="No vehicles on the ledger"
          body="Add a car or other vehicle with market value and remaining loan. Equity is value minus debt."
        />
      ) : (
        <>
          <div className="mb-4 flex gap-8">
            <div>
              <div className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">Gross value</div>
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
            {rows.map((v) => (
              <Card key={v.id}>
                <CardHeader>
                  <CardTitle>{ownerLabel(v.owner, names)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-medium">{v.label}</div>
                  <div className="text-sm text-muted-foreground">
                    {[v.year, v.make, v.model].filter(Boolean).join(" ") || "—"}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <Field k="Market value" v={<Money value={v.estimate} />} />
                    <Field k="As of" v={formatDate(v.asOfDate)} />
                    <Field k="Loan balance" v={<Money value={v.debt} />} />
                    <Field k="Equity" v={<Money value={v.equity} />} />
                    <Field k="LTV" v={v.ltv == null ? "—" : formatPct(v.ltv * 100, 1, false)} />
                  </div>
                  <div className="mt-3">
                    <VehicleForm
                      names={names}
                      existing={{
                        id: v.id,
                        label: v.label,
                        year: v.year,
                        make: v.make ?? "",
                        model: v.model ?? "",
                        estimate: v.estimate,
                        loanBalance: v.loanBalance,
                        asOfDate: v.asOfDate.toISOString().slice(0, 10),
                        owner: v.owner,
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
