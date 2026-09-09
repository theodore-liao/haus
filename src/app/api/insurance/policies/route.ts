import { NextResponse } from "next/server";
import { mkdir, rename, unlink } from "fs/promises";
import path from "path";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().optional(),
  type: z.string(),
  carrier: z.string().min(1),
  policyNumber: z.string().nullable().optional(),
  namedInsured: z.string(),
  owner: z.string(),
  coverage: z.record(z.string(), z.unknown()).optional(),
  premium: z.number().nullable().optional(),
  billingFrequency: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  renewalDate: z.string().nullable().optional(),
  propertyId: z.string().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  hsaEligible: z.boolean().optional(),
  coveredMembers: z.array(z.string()).optional(),
  notes: z.string().optional(),
  tempId: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  ext: z.string().optional(),
  ocrText: z.string().optional(),
});

export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const d = parsed.data;
  const data = {
    type: d.type,
    carrier: d.carrier,
    policyNumber: d.policyNumber,
    namedInsured: d.namedInsured,
    owner: d.owner,
    coverageJson: JSON.stringify(d.coverage ?? {}),
    premium: d.premium,
    billingFrequency: d.billingFrequency,
    effectiveDate: d.effectiveDate ? new Date(d.effectiveDate) : null,
    renewalDate: d.renewalDate ? new Date(d.renewalDate) : null,
    propertyId: d.propertyId,
    vehicleId: d.vehicleId,
    hsaEligible: d.hsaEligible ?? false,
    coveredMembers: JSON.stringify(d.coveredMembers ?? []),
    notes: d.notes,
  };
  const policy = d.id
    ? await prisma.insurancePolicy.update({ where: { id: d.id }, data })
    : await prisma.insurancePolicy.create({ data });

  if (d.tempId) {
    const tmp = path.join(process.cwd(), "data", "insurance", "tmp", `${d.tempId}${d.ext ?? ""}`);
    const destDir = path.join(process.cwd(), "data", "insurance");
    await mkdir(destDir, { recursive: true });
    const dest = path.join(destDir, `${policy.id}-${d.tempId}${d.ext ?? ""}`);
    try {
      await rename(tmp, dest);
    } catch {
      return NextResponse.json({ ok: true, policy, warning: "Policy saved; source file could not be moved." });
    }
    const old = await prisma.insuranceDocument.findMany({ where: { policyId: policy.id } });
    for (const doc of old) {
      await unlink(doc.path).catch(() => null);
    }
    await prisma.insuranceDocument.deleteMany({ where: { policyId: policy.id } });
    await prisma.insuranceDocument.create({
      data: {
        policyId: policy.id,
        filename: d.filename ?? "upload",
        mimeType: d.mimeType ?? "application/octet-stream",
        path: dest,
        ocrText: d.ocrText,
      },
    });
  }

  return NextResponse.json({ ok: true, policy });
}

export async function DELETE(req: Request) {
  await requireSession();
  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.insurancePolicy.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
