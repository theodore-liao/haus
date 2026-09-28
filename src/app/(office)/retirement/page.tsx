import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { HeroCard } from "@/components/hero-card";
import { annualisedPaychecks, annualisedSpend, getConnectionCount, getOverview, getReports, getRetirement } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { hausTypeLabel, isChildAccountType } from "@/lib/account-types";
import { readProjectionPrefs } from "@/lib/projection-prefs";
import { RetirementPlan, type SaveNow } from "./plan";
import { RetirementAccounts } from "./board";
import { AddHsa } from "./hsa-form";
import { ChildrenForms } from "../children/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";

export const dynamic = "force-dynamic";

export default async function RetirementPage() {
  const owner = await getOwnerFilter();
  const [connections, data, projectionPrefs, overview, reports] = await Promise.all([
    getConnectionCount(),
    getRetirement(owner),
    readProjectionPrefs(),
    getOverview(owner),
    getReports(owner),
  ]);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const custodial = data.rows.filter((r) => isChildAccountType(r.kind));
  const retirement = data.rows.filter((r) => !isChildAccountType(r.kind));
  const noLedger = !connections && data.rows.length === 0;

  // Spending once retired starts from today's spending without loan payments: the house is planned as a cash purchase.
  const run = annualisedSpend(reports.flows, now);
  const spendNow = run ? Math.round(run.noLoans * run.factor) : null;
  // What the household saves now: regular take-home pay (bonuses dropped) minus all spending, plus retirement
  // contributions, which come out before take-home pay.
  const paychecks = annualisedPaychecks(reports.flows);
  const pay = paychecks.annual;
  const ytd = retirement.reduce((sum, row) => sum + row.ytd, 0);
  const yearFraction = Math.max(1 / 12, (now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / (365.25 * 86400000));
  const contributions = Math.max(0, ytd / yearFraction);
  const saveNow: SaveNow | null =
    pay > 0 && run
      ? {
          amount: pay - run.total * run.factor + contributions,
          pay: Math.round(pay),
          paySources: paychecks.sources.map((source) => ({
            label: source.label,
            amount: source.amount,
            cadence: source.cadence,
            perYear: source.perYear,
          })),
          spend: run.total * run.factor,
          spendPeriod: run.total,
          loans: Math.round((run.total - run.noLoans) * run.factor),
          factor: run.factor,
          contributions: Math.round(contributions),
          contributionsYtd: ytd,
          yearFraction,
          basis: run.basis,
        }
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
        lockedDefault={retirement.reduce((sum, row) => sum + row.balance, 0)}
        netWorth={overview.netWorth}
        spendNow={spendNow}
        childBalances={custodial.reduce((sum, row) => sum + row.balance, 0)}
        householdChildren={data.names.children.map((child) => ({ id: child.id, name: child.name }))}
        holders={[
          { key: "A", name: data.names.nameA, birthdate: data.names.birthdateA },
          { key: "B", name: data.names.nameB, birthdate: data.names.birthdateB },
        ]}
      />
    </>
  );
}
