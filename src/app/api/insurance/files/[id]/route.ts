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
  const buf = await readFile(doc.path).catch(() => null);
  if (!buf) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // Only images and PDFs open in the page; anything else downloads, so a stored file can never run as a web page here.
  const viewable = /^image\/(?!svg)[\w.+-]+$|^application\/pdf$/i.test(doc.mimeType);
  const name = encodeURIComponent(doc.filename);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": viewable ? doc.mimeType : "application/octet-stream",
      "Content-Disposition": `${viewable ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
