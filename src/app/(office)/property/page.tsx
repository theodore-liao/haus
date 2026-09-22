import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ObjectTitle, OwnerTag, SectionLabel } from "@/components/type";
import { Money, HeroMetric } from "@/components/money";
import { HeroCard } from "@/components/hero-card";
import { prisma } from "@/lib/db";
import { getNames, getRealEstate } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { matchesOwner, ownerLabel } from "@/lib/owners";
import { formatDate, formatMoney } from "@/lib/format";
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
        <div className="page-stack">
          <HeroCard
            kicker="Total equity"
            supporting={
              <>
                Real estate <Money value={reEq} /> + Vehicles <Money value={vehEq} />
              </>
            }
          >
            <Money value={reEq + vehEq} />
          </HeroCard>

          <section>
            <SectionLabel>Real estate</SectionLabel>
            {re.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No homes yet.</p>
            ) : (
              <div className="grid items-stretch gap-4 lg:grid-cols-2">
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
                    <Card key={p.id} className="h-full">
                      <CardHeader row className="flex-nowrap">
                        <div className="min-w-0 flex-1">
                          <ObjectTitle title={`${p.label} - ${ownerLabel(p.owner, names)}`} className="flex items-baseline">
                            <span className="truncate">{p.label}</span>
                            <OwnerTag>{ownerLabel(p.owner, names)}</OwnerTag>
                          </ObjectTitle>
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
                        <HeroMetric label="Equity">
                          <Money value={p.equity} />
                        </HeroMetric>
                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                          <span>
                            Principal <Money value={p.loanBalance} className="text-sm text-foreground" />
                          </span>
                          <span>
                            Rate <span className="num text-foreground">{p.rate == null ? "—" : `${p.rate.toFixed(2)}%`}</span>
                          </span>
                          <span>
                            Payment <span className="num money text-foreground">{totalPay ? formatMoney(totalPay) : "—"}</span>
                          </span>
                          {n ? (
                            <span>
                              <span className="num text-foreground">
                                {Math.floor(n / 12)} yr {n % 12} mo
                              </span>{" "}
                              left
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
            <SectionLabel>Vehicles</SectionLabel>
            {vehRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No vehicles yet. Add one — the value stays until you edit it.</p>
            ) : (
              <div className="grid items-stretch gap-4 lg:grid-cols-2">
                {vehRows.map((v) => (
                  <Card key={v.id} className="h-full">
                    <CardHeader row className="flex-nowrap">
                      <div className="min-w-0 flex-1">
                        <ObjectTitle title={`${v.label} - ${ownerLabel(v.owner, names)}`} className="flex items-baseline">
                          <span className="truncate">{v.label}</span>
                          <OwnerTag>{ownerLabel(v.owner, names)}</OwnerTag>
                        </ObjectTitle>
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
                          vin: v.vin ?? "",
                          asOfDate: v.asOfDate.toISOString().slice(0, 10),
                          owner: v.owner,
                        }}
                      />
                    </CardHeader>
                    <CardContent>
                      <HeroMetric label="Equity">
                        <Money value={v.equity} />
                      </HeroMetric>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {v.vin ? <span className="mb-1 block font-mono text-xs">VIN {v.vin}</span> : null}
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
