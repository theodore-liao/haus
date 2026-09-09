import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function POST(req: Request) {
  await requireSession();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File required." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type) && !file.type.startsWith("image/") && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
    return NextResponse.json({ error: "Use jpg, png, webp, or pdf." }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const tmpDir = path.join(process.cwd(), "data", "insurance", "tmp");
  await mkdir(tmpDir, { recursive: true });
  const extFromName = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const ext =
    extFromName ||
    (file.type === "image/png"
      ? ".png"
      : file.type === "image/jpeg"
        ? ".jpg"
        : file.type === "image/webp"
          ? ".webp"
          : file.type === "application/pdf"
            ? ".pdf"
            : ".png");
  const filename = file.name && file.name.includes(".") ? file.name : `clipboard${ext}`;
  const tempId = randomUUID();
  const dest = path.join(tmpDir, `${tempId}${ext}`);
  await writeFile(dest, buf);

  return NextResponse.json({
    tempId,
    filename,
    mimeType: file.type || (ext === ".pdf" ? "application/pdf" : "image/png"),
    ext,
  });
}
