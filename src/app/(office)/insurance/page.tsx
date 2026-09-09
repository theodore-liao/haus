import { PageHeader } from "@/components/page-header";
import { getInsurance } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { InsuranceDesk } from "./desk";

export const dynamic = "force-dynamic";

export default async function InsurancePage() {
  const owner = await getOwnerFilter();
  const data = await getInsurance(owner);
  return (
    <>
      <PageHeader title="Insurance" />
      <InsuranceDesk
        policies={JSON.parse(JSON.stringify(data.policies))}
        properties={data.properties.map((p) => ({ id: p.id, label: p.label, estimate: p.estimate }))}
        vehicles={data.vehicles.map((v) => ({ id: v.id, label: v.label }))}
        names={data.names}
      />
    </>
  );
}
