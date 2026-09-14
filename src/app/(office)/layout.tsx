import { AppShell } from "@/components/app-shell";
import { getNames } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { givenName } from "@/lib/owners";

export const dynamic = "force-dynamic";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const names = await getNames();
  const latest = await prisma.plaidItem.findFirst({
    orderBy: { lastSyncedAt: "desc" },
    select: { lastSyncedAt: true },
  });
  return (
    <AppShell
      nameA={givenName(names.nameA) || names.nameA}
      nameB={givenName(names.nameB) || names.nameB}
      lastSynced={latest?.lastSyncedAt?.toISOString() ?? null}
    >
      {children}
    </AppShell>
  );
}
