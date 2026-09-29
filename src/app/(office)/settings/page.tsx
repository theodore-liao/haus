import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/queries";
import { readTransactionsStoredSince } from "@/lib/saved-txns";
import { readProjectionPrefs } from "@/lib/projection-prefs";
import { SettingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [data, transactionsStoredSince, prefs] = await Promise.all([
    getSettings(),
    readTransactionsStoredSince(),
    readProjectionPrefs(),
  ]);
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsClient
        nameA={data.names.nameA}
        nameB={data.names.nameB}
        birthdateA={data.names.birthdateA}
        birthdateB={data.names.birthdateB}
        householdChildren={data.names.children}
        pairCardPayments={data.names.pairCardPayments}
        keepTransactions={data.names.keepTransactions}
        transactionsStoredSince={transactionsStoredSince}
        tabs={data.names.tabs}
        planChildren={prefs.planChildren ?? []}
        connectionCount={data.items.length}
        lastSynced={data.items.reduce<string | null>((latest, i) => {
          if (!i.lastSyncedAt) return latest;
          const iso = i.lastSyncedAt.toISOString();
          return !latest || iso > latest ? iso : latest;
        }, null)}
      />
    </>
  );
}
