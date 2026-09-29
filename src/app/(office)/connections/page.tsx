import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/queries";
import { accountLabel, withoutInstitution } from "@/lib/account-label";
import { ConnectionsPanel } from "@/components/connections-panel";
import { EmptyLedger } from "@/components/states";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const data = await getSettings();
  if (data.items.length === 0) {
    return (
      <>
        <PageHeader title="Connections" />
        <EmptyLedger
          page="/connections"
          title="No connections yet"
          body={
            data.plaidReady
              ? "Link a bank, card, or brokerage. Some institutions start with no accounts selected, so check every account you want."
              : "Link a bank, card, or brokerage once bank linking is set up on this computer: add the Plaid keys to the .env file and restart Haus."
          }
          plaidReady={data.plaidReady}
        />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Connections" />
      <ConnectionsPanel
        plaidReady={data.plaidReady}
        items={data.items.map((i) => ({
          id: i.id,
          institutionName: i.institutionName,
          status: i.status,
          errorMessage: i.errorMessage,
          lastSyncedAt: i.lastSyncedAt?.toISOString() ?? null,
          defaultOwner: i.defaultOwner,
          accounts: i.accounts.map((a) => ({
            id: a.id,
            name: withoutInstitution(accountLabel(a.name, i.institutionName), i.institutionName),
            mask: a.mask,
            hausType: a.hausType,
            owner: a.owner,
            isRetirement: a.isRetirement,
            retirementKind: a.retirementKind,
            balance: a.currentBalance,
          })),
        }))}
        names={data.names}
        now={new Date().getTime()}
      />
    </>
  );
}
