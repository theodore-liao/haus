import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { HeroCard } from "@/components/hero-card";
import { withBlurredMoney } from "@/components/blur-money";
import { annualisedPaychecks, annualisedSpend, getConnectionCount, getEquityComp, getOverview, getReports, getRetirement } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { hasSpouse } from "@/lib/owners";
import { hausTypeLabel, isChildAccountType } from "@/lib/account-types";
import { readProjectionPrefs } from "@/lib/projection-prefs";
import { contributionsPriorQuarter, estimateSaving, retirementSnapshot } from "@/lib/retirement-snapshot";
import { Pill, Pills } from "@/components/pills";
import { formatApprox } from "@/lib/format";
import { RetirementPlan, type SaveNow } from "./plan";
import { RetirementAccounts } from "./board";
import { AddHsa } from "./hsa-form";
import { ChildrenForms } from "../children/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";

export const dynamic = "force-dynamic";

export default async function RetirementPage() {
  const owner = await getOwnerFilter();
  const [connections, data, projectionPrefs, overview, reports, equity] = await Promise.all([
    getConnectionCount(),
    getRetirement(owner),
    readProjectionPrefs(),
    getOverview(owner),
    getReports(owner),
    getEquityComp(owner),
  ]);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const custodial = data.rows.filter((r) => isChildAccountType(r.kind));
  const retirement = data.rows.filter((r) => !isChildAccountType(r.kind));
  const noLedger = !connections && data.rows.length === 0;

  // Spending once retired starts from today's spending without loan payments: the house is planned as a cash purchase.
  const run = annualisedSpend(reports.flows, now);
  const spendNow = run ? Math.round(run.noLoans * run.factor) : null;
  // What the household saves now: regular take-home pay (bonuses dropped) and stock vests, minus all spending,
  // plus retirement contributions and stock-plan purchases, which come out before take-home pay.
  const paychecks = annualisedPaychecks(reports.flows);
  const pay = paychecks.annual;
  const ytd = retirement.reduce((sum, row) => sum + row.ytd, 0);
  const contribWindow = contributionsPriorQuarter(retirement, now);
  const estimate = estimateSaving({
    payAnnual: pay,
    spendAnnual: run ? run.total * run.factor : null,
    contributionsAnnual: contribWindow * 4,
    vestAnnual: equity.saveVests.annual,
    esppAnnual: equity.saveEspp.annual,
    now,
  });
  const saveNow: SaveNow | null =
    estimate && run
      ? {
          amount: estimate.amount,
          pay: Math.round(pay),
          paySources: paychecks.sources.map((source) => ({
            label: source.label,
            amount: source.amount,
            cadence: source.cadence,
            perYear: source.perYear,
          })),
          spend: run.total * run.factor,
          spendPeriod: run.total,
          loans: Math.round(run.total - run.noLoans),
          factor: run.factor,
          contributions: Math.round(estimate.contributions),
          contributionsPeriod: contribWindow,
          vests: equity.saveVests.annual > 0 ? equity.saveVests : null,
          espp: equity.saveEspp.annual > 0 ? equity.saveEspp : null,
          basis: run.basis,
        }
      : null;

  // The header's figures: balances by how they are taxed, this year's contributions, and the planner's verdict.
  const sumOf = (kinds: string[]) => retirement.filter((r) => kinds.includes(r.kind)).reduce((sum, r) => sum + r.balance, 0);
  const groups = [
    { kicker: "Pre-tax", accent: "#D4BE7A", value: sumOf(["401k", "403b", "ira"]) },
    { kicker: "Roth", accent: "#7EABD4", value: sumOf(["roth"]) },
    { kicker: "HSA", accent: "#6FC4B0", value: sumOf(["hsa"]) },
    { kicker: "Child accounts", accent: "#B7A3D6", value: custodial.reduce((sum, r) => sum + r.balance, 0) },
  ].filter((g) => Math.abs(g.value) >= 1);
  const verdict = retirementSnapshot({
    prefs: projectionPrefs,
    holders: [
      { key: "A", birthdate: data.names.birthdateA },
      { key: "B", birthdate: data.names.birthdateB },
    ],
    today,
    investedDefault: overview.tiles.cash + overview.tiles.investments - custodial.reduce((sum, row) => sum + row.balance, 0),
    spendNow,
    saveNow: saveNow?.amount ?? null,
    childBalances: custodial.reduce((sum, row) => sum + row.balance, 0),
    householdChildren: data.names.children.map((child) => ({ id: child.id, name: child.name })),
  });
  const verdictText =
    verdict.number != null && verdict.needed != null && verdict.saving != null
      ? verdict.saving >= verdict.needed
        ? verdict.ageKnown && verdict.paceAge != null && verdict.paceAge < verdict.retireAge
          ? `On pace to retire at ${verdict.retireAge}, or as early as ${verdict.paceAge}`
          : `On pace to retire ${verdict.ageKnown ? `at ${verdict.retireAge}` : `in ${verdict.retireYear}`}`
        : `About ${formatApprox(verdict.needed - verdict.saving)} a year short of retiring ${verdict.ageKnown ? `at ${verdict.retireAge}` : `in ${verdict.retireYear}`}`
      : null;

  const childAccounts = (
    <>
      <Card className="h-full">
          <CardHeader row>
            <CardTitle>Child Accounts</CardTitle>
            <ChildrenForms names={data.names} actions="entry" />
          </CardHeader>
          <CardContent className="space-y-3">
            {custodial.length === 0 ? (
              <p className="text-sm text-muted-foreground">No child accounts yet.</p>
            ) : (
              custodial.map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0">
                  <div className="cell-stack text-sm">
                    <span>{m.name}</span>
                    <span>
                      {hausTypeLabel(m.kind)}
                      {m.childLabel ? ` · ${m.childLabel}` : " · No child assigned"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Money value={m.balance} />
                    {m.manual ? (
                      <ChildrenForms
                        names={data.names}
                        existing={{
                          id: m.id,
                          hausType: m.kind,
                          name: m.name,
                          owner: m.owner,
                          beneficiary: m.beneficiary ?? "",
                          balance: m.balance,
                          asOfDate: new Date().toISOString().slice(0, 10),
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
      </Card>
    </>
  );

  return (
    <>
      <PageHeader
        title="Retirement"
        actions={
          <>
            <AddHsa names={data.names} />
            <ChildrenForms names={data.names} actions={noLedger ? undefined : "child"} />
          </>
        }
      />
      <HeroCard
        kicker="Retirement"
        supporting={
          retirement.length === 0 ? (
            noLedger ? (
              <>
                No retirement accounts yet. Link a 401(k), IRA, Roth, 403(b), or HSA in{" "}
                <Link href="/connections" className="underline">
                  Connections
                </Link>
                , or add an HSA above.
              </>
            ) : (
              <>
                Nothing is marked as retirement. In{" "}
                <Link href="/connections" className="underline">
                  Connections
                </Link>
                , mark an account as IRA, Roth, 401(k), 403(b), or HSA.
              </>
            )
          ) : (
            <span className="prose-num">
              {retirement.length} {retirement.length === 1 ? "account" : "accounts"}
              {ytd > 0 ? (
                <>
                  {" "}
                  · <Money value={ytd} /> contributed this year
                </>
              ) : null}
              {verdictText ? <span className="block">{withBlurredMoney(`${verdictText}, by the planner below.`)}</span> : null}
            </span>
          )
        }
        aside={
          groups.length > 1 ? (
            <Pills compact>
              {groups.map((g) => (
                <Pill key={g.kicker} kicker={g.kicker} accent={g.accent}>
                  <Money value={g.value} />
                </Pill>
              ))}
            </Pills>
          ) : undefined
        }
      >
        <Money value={retirement.reduce((sum, row) => sum + row.balance, 0)} />
      </HeroCard>
      <RetirementPlan
        accounts={retirement.length > 0 ? <RetirementAccounts rows={retirement} /> : null}
        childAccounts={childAccounts}
        saveNow={saveNow}
        today={today}
        saved={projectionPrefs}
        // Child accounts pay for college, so they come off college costs rather than counting as retirement money.
        investedDefault={overview.tiles.cash + overview.tiles.investments - custodial.reduce((sum, row) => sum + row.balance, 0)}
        netWorth={overview.netWorth}
        spendNow={spendNow}
        childBalances={custodial.reduce((sum, row) => sum + row.balance, 0)}
        householdChildren={data.names.children.map((child) => ({ id: child.id, name: child.name }))}
        holders={[
          { key: "A", name: data.names.nameA, birthdate: data.names.birthdateA },
          ...(hasSpouse(data.names) ? [{ key: "B" as const, name: data.names.nameB, birthdate: data.names.birthdateB }] : []),
        ]}
      />
    </>
  );
}
