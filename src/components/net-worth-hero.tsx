import { Money } from "./money";
import { HeroCard } from "./hero-card";

/** @deprecated Use HeroCard. Kept so old imports keep working. */
export function NetWorthHero({
  netWorth,
  assets,
  liabilities,
  dayChange,
  weekChange,
  monthChange,
}: {
  netWorth: number;
  assets: number;
  liabilities: number;
  dayChange: number | null;
  weekChange: number | null;
  monthChange: number | null;
}) {
  return (
    <HeroCard
      kicker="Household net worth"
      supporting={
        <>
          Assets <Money value={assets} /> − Liabilities <Money value={liabilities} />
        </>
      }
      deltas={[
        { label: "Day", value: dayChange },
        { label: "Week", value: weekChange },
        { label: "Month", value: monthChange },
      ]}
    >
      <Money value={netWorth} />
    </HeroCard>
  );
}
