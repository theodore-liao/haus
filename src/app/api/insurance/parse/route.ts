import { NextResponse } from "next/server";
import { mkdir, readdir, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { requireSession } from "@/lib/auth";
import { CARD_UPLOAD_MAX_MB } from "@/lib/insurance";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function POST(req: Request) {
  await requireSession();
  const tooBig = NextResponse.json({ error: `That file is too big. Use one under ${CARD_UPLOAD_MAX_MB} MB.` }, { status: 413 });
  // A body past the proxy's limit arrives cut short and can't be read as a form.
  const form = await req.formData().catch(() => null);
  if (!form) return Number(req.headers.get("content-length")) > CARD_UPLOAD_MAX_MB * 1024 * 1024 ? tooBig : NextResponse.json({ error: "File required." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File required." }, { status: 400 });
  }
  if (file.size > CARD_UPLOAD_MAX_MB * 1024 * 1024) return tooBig;
  if (!ALLOWED.has(file.type) && !file.type.startsWith("image/") && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
    return NextResponse.json({ error: "Use jpg, png, webp, or pdf." }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const tmpDir = path.join(process.cwd(), "data", "insurance", "tmp");
  await mkdir(tmpDir, { recursive: true });
  // An upload whose card was never saved (the page closed, or the save failed) leaves its image here. They are ID cards,
  // so anything older than a day goes.
  for (const name of await readdir(tmpDir).catch(() => [])) {
    const leftover = path.join(tmpDir, name);
    const info = await stat(leftover).catch(() => null);
    if (info?.isFile() && Date.now() - info.mtimeMs > 86_400_000) await rm(leftover, { force: true }).catch(() => null);
  }
  // Only a plain extension from the name is kept; anything else (spaces, dashes, slashes) falls back to the type's.
  const nameExt = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const extFromName = /^\.[A-Za-z0-9]{1,8}$/.test(nameExt) ? nameExt : "";
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
