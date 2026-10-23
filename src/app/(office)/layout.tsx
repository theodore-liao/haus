import { AppShell } from "@/components/app-shell";
import { getNames } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { givenName, hasSpouse } from "@/lib/owners";
import { oldestSync } from "@/lib/refresh-plan";

export const dynamic = "force-dynamic";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const names = await getNames();
  const items = await prisma.plaidItem.findMany({ select: { lastSyncedAt: true, status: true } });
  // The sidebar shows the latest sync; the automatic refresh goes by the oldest connection that can sync.
  const latest = items.reduce<Date | null>((max, i) => (i.lastSyncedAt && (!max || i.lastSyncedAt > max) ? i.lastSyncedAt : max), null);
  const oldest = items.length ? oldestSync(items) : null;
  return (
    <AppShell
      nameA={givenName(names.nameA) || names.nameA}
      nameB={hasSpouse(names) ? givenName(names.nameB) || names.nameB : ""}
      lastSynced={latest?.toISOString() ?? null}
      oldestSynced={oldest?.toISOString() ?? null}
      tabs={names.tabs}
    >
      {children}
    </AppShell>
  );
}
