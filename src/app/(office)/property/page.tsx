import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { prisma } from "@/lib/db";
import { getNames, getRealEstate } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { matchesOwner, ownerLabel } from "@/lib/owners";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { vehicleDebt } from "@/lib/property";
import {
  housingEscrow,
  monthlyPi,
  piFromPayment,
  remainingFromPayment,
  yearLabel,
  amortize,
} from "@/lib/amortization";
import { PropertyForm } from "../real-estate/form";
import { VehicleForm } from "../vehicles/form";
import { RemainingPrincipalCurve } from "@/components/remaining-principal-curve";

export const dynamic = "force-dynamic";

export default async function PropertyPage() {
  const owner = await getOwnerFilter();
  const names = await getNames();
  const re = await getRealEstate(owner);
  const vehicles = (await prisma.vehicle.findMany({ orderBy: { createdAt: "asc" } })).filter((v) =>
    matchesOwner(v.owner, owner),
  );
  const vehRows = vehicles.map((v) => {
    const loanBalance = (v as { loanBalance?: number | null }).loanBalance ?? null;
    const debt = vehicleDebt({ ...v, loanBalance }, []);
    const equity = v.estimate - debt;
    return { ...v, loanBalance, debt, equity };
  });
  const reEq = re.rows.reduce((s, r) => s + r.equity, 0);
  const vehEq = vehRows.reduce((s, r) => s + r.equity, 0);

  return (
    <>
      <PageHeader
        title="Property"
        actions={
          <div className="flex flex-wrap gap-2">
            <PropertyForm names={names} />
            <VehicleForm names={names} />
          </div>
        }
      />
      {re.rows.length === 0 && vehRows.length === 0 ? (
        <EmptyLedger
          showConnect={false}
          title="No property on the ledger"
          body="Add a home with market value and mortgage terms, or a vehicle with a manual value. Equity does not move until you edit it."
        />
      ) : (
        <div className="space-y-8">
          <div className="flex flex-wrap gap-8">
            <div>
              <div className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">Real estate equity</div>
              <div className="text-2xl">
                <Money value={reEq} />
              </div>
            </div>
            <div>
              <div className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">Vehicle equity</div>
              <div className="text-2xl">
                <Money value={vehEq} />
              </div>
            </div>
          </div>

          <section>
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Real estate</h2>
            {re.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No homes yet.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {re.rows.map((p) => {
                  const housing = housingEscrow({
                    taxAnnual: p.taxAnnual,
                    insuranceAnnual: p.insuranceAnnual,
                    escrowMonthly: p.escrowMonthly,
                    pmiMonthly: p.pmiMonthly,
                  });
                  const piFromTerm =
                    p.loanBalance && p.rate && p.termMonths ? monthlyPi(p.loanBalance, p.rate, p.termMonths) : 0;
                  const pi = p.piti ? piFromPayment(p.piti, housing.escrowAndPmi) : piFromTerm;
                  const n =
                    p.loanBalance && p.rate && pi ? remainingFromPayment(p.loanBalance, p.rate, pi) : p.termMonths;
                  const schedule =
                    p.loanBalance && p.rate && n
                      ? amortize({ principal: p.loanBalance, aprPct: p.rate, remainingMonths: n })
                      : null;
                  const totalPay = p.piti ?? pi + housing.escrowAndPmi;
                  return (
                    <Card key={p.id}>
                      <CardHeader className="flex flex-row items-start justify-between space-y-0">
                        <div>
                          <CardTitle className="text-base font-medium normal-case tracking-normal text-foreground">
                            {p.label}
                          </CardTitle>
                          <div className="mt-1 text-sm text-muted-foreground">{ownerLabel(p.owner, names)}</div>
                        </div>
                        <PropertyForm
                          names={names}
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
                            originalTermMonths: p.originalTermMonths,
                            originationDate: p.originationDate ? p.originationDate.toISOString().slice(0, 10) : null,
                            taxAnnual: p.taxAnnual,
                            insuranceAnnual: p.insuranceAnnual,
                            escrowMonthly: p.escrowMonthly,
                            pmiMonthly: p.pmiMonthly,
                            piti: p.piti,
                            rent: p.rent,
                          }}
                        />
                      </CardHeader>
                      <CardContent>
                        <div className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Equity</div>
                        <div className="text-3xl font-medium font-mono tabular-nums">
                          <Money value={p.equity} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                          <span>
                            Principal <Money value={p.loanBalance} className="text-sm text-foreground" />
                          </span>
                          <span>Rate {p.rate == null ? "—" : `${p.rate.toFixed(2)}%`}</span>
                          <span>Payment {totalPay ? formatMoney(totalPay) : "—"}</span>
                          {n ? (
                            <span>
                              {Math.floor(n / 12)} yr {n % 12} mo left
                            </span>
                          ) : null}
                          {schedule ? <span>Payoff {yearLabel(schedule.payoff)}</span> : null}
                        </div>
                        {p.loanBalance && p.rate && pi ? (
                          <RemainingPrincipalCurve
                            principal={p.loanBalance}
                            rate={p.rate}
                            monthlyPi={pi}
                            originationDate={p.originationDate ? p.originationDate.toISOString() : null}
                            originalTermMonths={p.originalTermMonths}
                          />
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Vehicles</h2>
            {vehRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No vehicles yet. Add one — the value stays until you edit it.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {vehRows.map((v) => (
                  <Card key={v.id}>
                    <CardHeader className="flex flex-row items-start justify-between space-y-0">
                      <div>
                        <CardTitle className="text-base font-medium normal-case tracking-normal text-foreground">
                          {v.label}
                        </CardTitle>
                        <div className="mt-1 text-sm text-muted-foreground">{ownerLabel(v.owner, names)}</div>
                      </div>
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
                    </CardHeader>
                    <CardContent>
                      <div className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Equity</div>
                      <div className="text-2xl font-medium font-mono tabular-nums">
                        <Money value={v.equity} />
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        Value <Money value={v.estimate} className="text-sm" />
                        {v.debt > 0 ? (
                          <>
                            {" "}
                            · Loan <Money value={v.debt} className="text-sm" />
                          </>
                        ) : null}
                        <span className="block text-xs">As of {formatDate(v.asOfDate)} (manual)</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
