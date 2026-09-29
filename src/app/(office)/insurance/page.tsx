import { PageHeader } from "@/components/page-header";
import { getInsurance } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { HeroCard } from "@/components/hero-card";
import { Pill, Pills } from "@/components/pills";
import { Money } from "@/components/money";
import { shownPolicies, yearlyPremium } from "@/lib/insurance";
import { InsuranceDesk } from "./desk";

export const dynamic = "force-dynamic";

export default async function InsurancePage() {
  const owner = await getOwnerFilter();
  const data = await getInsurance(owner);
  const memberIds = ["a", "b", ...data.names.children.map((c) => `child:${c.id}`)];
  const shown = shownPolicies(data.policies, memberIds, data.vehicles.map((v) => v.id));
  const priced = shown.map(yearlyPremium).filter((n): n is number => n != null);
  const sectionTotal = (types: string[]) =>
    shown.filter((p) => types.includes(p.type)).reduce((sum, p) => sum + (yearlyPremium(p) ?? 0), 0);
  const sections = [
    { kicker: "Health", accent: "#6FC4B0", value: sectionTotal(["health", "vision", "dental", "other"]) },
    { kicker: "Vehicle", accent: "#7EABD4", value: sectionTotal(["vehicle", "auto"]) },
    { kicker: "Home", accent: "#D4BE7A", value: sectionTotal(["home"]) },
  ].filter((s) => s.value > 0);
  return (
    <>
      <PageHeader title="Insurance" />
      {/* Premiums are optional; the total shows once any card has one. */}
      {priced.length ? (
        <HeroCard
          kicker="Premiums a year"
          supporting={`${priced.length} saved ${priced.length === 1 ? "card has" : "cards have"} a premium.`}
          aside={
            <Pills compact>
              {sections.map((s) => (
                <Pill key={s.kicker} kicker={s.kicker} accent={s.accent}>
                  <Money value={s.value} />
                </Pill>
              ))}
            </Pills>
          }
        >
          <Money value={priced.reduce((sum, n) => sum + n, 0)} />
        </HeroCard>
      ) : null}
      <InsuranceDesk
        policies={JSON.parse(JSON.stringify(data.policies))}
        properties={data.properties.map((p) => ({ id: p.id, label: p.label, estimate: p.estimate }))}
        vehicles={data.vehicles.map((v) => ({ id: v.id, label: v.label }))}
        names={data.names}
      />
    </>
  );
}
