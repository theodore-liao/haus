import { PageHeader } from "@/components/page-header";
import { EmptyLedger } from "@/components/states";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ObjectTitle, OwnerTag, SectionLabel } from "@/components/type";
import { Money } from "@/components/money";
import { HeroCard } from "@/components/hero-card";
import { Callout } from "@/components/callout";
import { prisma } from "@/lib/db";
import { getNames, getRealEstate } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { matchesOwner, ownerLabel } from "@/lib/owners";
import { formatDate } from "@/lib/format";
import { vehicleDebt } from "@/lib/property";
import { housingEscrow, monthlyPi, piFromPayment } from "@/lib/amortization";
import { PropertyForm } from "../real-estate/form";
import { VehicleForm } from "../vehicles/form";
import { HomeLoan } from "./home-loan";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
/** A value older than this gets a nudge to update it, so equity stays right. */
const STALE_HOME_DAYS = 183;
const STALE_VEHICLE_DAYS = 365;


export default async function PropertyPage() {
  const owner = await getOwnerFilter();
  const names = await getNames();
  const re = await getRealEstate(owner);
  const vehicles = (await prisma.vehicle.findMany({ orderBy: { createdAt: "asc" } })).filter((v) => matchesOwner(v.owner, owner));
  const vehRows = vehicles.map((v) => {
    const loanBalance = (v as { loanBalance?: number | null }).loanBalance ?? null;
    const debt = vehicleDebt({ ...v, loanBalance }, []);
    const equity = v.estimate - debt;
    return { ...v, loanBalance, debt, equity };
  });
  const assets = re.rows.reduce((s, r) => s + r.estimate, 0) + vehRows.reduce((s, r) => s + r.estimate, 0);
  const debt = re.rows.reduce((s, r) => s + r.loanBalance, 0) + vehRows.reduce((s, r) => s + r.debt, 0);
  const now = new Date().getTime();
  // The summary's next step: which values are old enough to update.
  const staleNames = [
    ...re.rows.filter((r) => now - r.asOfDate.getTime() > STALE_HOME_DAYS * DAY).map((r) => r.label),
    ...vehRows.filter((v) => now - v.asOfDate.getTime() > STALE_VEHICLE_DAYS * DAY).map((v) => v.label),
  ];

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
          page="/property"
          showConnect={false}
          title="No homes or vehicles yet"
          body="Add a home with its value and mortgage, or a vehicle with its value and loan."
        />
      ) : (
        <div className="page-stack">
          <HeroCard
            kicker="Total equity"
            supporting={
              <span className="prose-num">
                <Money value={assets} /> in property − <Money value={debt} /> owed
                {assets > 0 && debt > 0 ? ` · ${Math.round((debt / assets) * 100)}% borrowed against it` : ""}
                <span className="block">
                  {staleNames.length
                    ? `Update the value of ${staleNames.join(", ")} so equity stays right.`
                    : "Every value is recent, so equity is current."}
                </span>
              </span>
            }
          >
            <Money value={assets - debt} />
          </HeroCard>

          <section>
            <SectionLabel>Real estate</SectionLabel>
            {re.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No homes yet.</p>
            ) : (
              <div className="grid gap-4">
                {re.rows.map((p) => {
                  const housing = housingEscrow({
                    taxAnnual: p.taxAnnual,
                    insuranceAnnual: p.insuranceAnnual,
                    escrowMonthly: p.escrowMonthly,
                    pmiMonthly: p.pmiMonthly,
                  });
                  const piFromTerm = p.loanBalance && p.rate && p.termMonths ? monthlyPi(p.loanBalance, p.rate, p.termMonths) : 0;
                  const pi = p.piti ? piFromPayment(p.piti, housing.escrowAndPmi) : piFromTerm;
                  const stale = now - p.asOfDate.getTime() > STALE_HOME_DAYS * DAY;
                  const rate = p.rate ?? 0;
                  const hasLoan = p.loanBalance > 0 && rate > 0 && pi > 0;
                  const summary = (
                    <>
                      <div className="stat-row">
                        <div className="stat">
                          <div className="kicker">Equity</div>
                          <div className="display-number">
                            <Money value={p.equity} />
                          </div>
                          <div className="stat-sub prose-num">
                            Worth <Money value={p.estimate} /> as of {formatDate(p.asOfDate)}
                            {p.loanBalance > 0 ? (
                              <>
                                {" "}
                                · owes <Money value={p.loanBalance} />
                                {p.ltv != null ? ` · ${Math.round(p.ltv * 100)}% borrowed` : ""}
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {stale ? (
                        <Callout tone="warn">
                          This value is over six months old. Use Edit to enter a fresh estimate so equity stays right.
                        </Callout>
                      ) : null}
                    </>
                  );
                  return (
                    <Card key={p.id}>
                      <CardHeader row className="flex-wrap sm:flex-nowrap">
                        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                          <ObjectTitle
                            title={`${p.label} - ${ownerLabel(p.owner, names)}`}
                            className="flex min-w-0 items-baseline"
                          >
                            <span className="min-w-0 truncate">{p.label}</span>
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
                            extraPrincipal: p.extraPrincipal,
                          }}
                        />
                      </CardHeader>
                      <CardContent className="space-y-5">
                        {hasLoan ? null : summary}
                        {hasLoan ? (
                          <HomeLoan
                            summary={summary}
                            id={p.id}
                            balance={p.loanBalance}
                            rate={rate}
                            pi={pi}
                            escrow={housing.escrow}
                            pmi={housing.pmi}
                            estimate={p.estimate}
                            rent={p.rent}
                            savedExtra={p.extraPrincipal}
                          />
                        ) : p.loanBalance > 0 ? (
                          <Callout tone="info">
                            Add the loan&apos;s rate and payment with Edit to see its payoff and interest.
                          </Callout>
                        ) : !stale ? (
                          <Callout tone="good">Owned outright.</Callout>
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
              <p className="text-sm text-muted-foreground">No vehicles yet.</p>
            ) : (
              <div className="grid gap-4">
                {vehRows.map((v) => {
                  const stale = now - v.asOfDate.getTime() > STALE_VEHICLE_DAYS * DAY;
                  return (
                    <Card key={v.id}>
                      <CardHeader row className="flex-wrap sm:flex-nowrap">
                        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                          <ObjectTitle
                            title={`${v.label} - ${ownerLabel(v.owner, names)}`}
                            className="flex min-w-0 items-baseline"
                          >
                            <span className="min-w-0 truncate">{v.label}</span>
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
                      <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:items-center">
                        <div className="stat-row">
                          <div className="stat">
                            <div className="kicker">Equity</div>
                            <div className={`display-number ${v.equity < 0 ? "text-negative" : ""}`}>
                              <Money value={v.equity} />
                            </div>
                            <div className="stat-sub prose-num">
                              Worth <Money value={v.estimate} /> as of {formatDate(v.asOfDate)}
                              {v.debt > 0 ? (
                                <>
                                  {" "}
                                  · owes <Money value={v.debt} />
                                </>
                              ) : null}
                            </div>
                            {v.vin ? <div className="stat-sub font-mono">VIN {v.vin}</div> : null}
                          </div>
                        </div>
                        <div className="space-y-2">
                          {v.equity < 0 ? (
                            <Callout tone="bad">
                              <span className="prose-num">
                                The loan is <Money value={-v.equity} /> more than the vehicle is worth. Selling it would not clear
                                the loan.
                              </span>
                            </Callout>
                          ) : null}
                          {stale ? (
                            <Callout tone="warn">
                              This value is over a year old. Vehicles lose value each year, so update it with Edit.
                            </Callout>
                          ) : null}
                          {v.equity >= 0 && !stale ? (
                            <Callout tone="good">
                              {v.debt > 0 ? "Worth more than its loan." : "Owned outright."} Update the value about once a year.
                            </Callout>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
