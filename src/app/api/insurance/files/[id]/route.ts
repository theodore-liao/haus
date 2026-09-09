import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await ctx.params;
  const doc = await prisma.insuranceDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const buf = await readFile(doc.path);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${doc.filename}"`,
    },
  });
}
