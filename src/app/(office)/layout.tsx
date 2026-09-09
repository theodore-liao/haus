import { AppShell } from "@/components/app-shell";
import { getNames } from "@/lib/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const names = await getNames();
  const latest = await prisma.plaidItem.findFirst({
    orderBy: { lastSyncedAt: "desc" },
    select: { lastSyncedAt: true },
  });
  return (
    <AppShell
      nameA={names.nameA}
      nameB={names.nameB}
      lastSynced={latest?.lastSyncedAt?.toISOString() ?? null}
    >
      {children}
    </AppShell>
  );
}
