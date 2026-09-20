import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/queries";
import { accountLabel } from "@/lib/account-label";
import { ConnectionsPanel } from "@/components/connections-panel";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const data = await getSettings();
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
            name: accountLabel(a.name, i.institutionName),
            mask: a.mask,
            hausType: a.hausType,
            owner: a.owner,
            isRetirement: a.isRetirement,
            retirementKind: a.retirementKind,
          })),
        }))}
        names={data.names}
      />
    </>
  );
}
