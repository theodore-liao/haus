import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/queries";
import { SettingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await getSettings();
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsClient nameA={data.names.nameA} nameB={data.names.nameB} />
    </>
  );
}
