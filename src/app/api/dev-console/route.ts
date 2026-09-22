import { appendFile, mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const file = path.join(process.cwd(), ".grok", "console.jsonl");

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ ok: false }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { level?: unknown; message?: unknown; url?: unknown; stack?: unknown } | null;
  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const row = {
    ts: new Date().toISOString(),
    level: body.level === "warning" ? "warning" : "error",
    message: body.message.replace(/\s+/g, " ").trim().slice(0, 500),
    url: typeof body.url === "string" ? body.url.slice(0, 200) : "",
    stack: typeof body.stack === "string" ? body.stack.slice(0, 800) : "",
  };
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(row)}\n`, "utf8");
  const info = await stat(file).catch(() => null);
  if (info && info.size > 200_000) {
    const text = await readFile(file, "utf8");
    const tail = text.trim().split("\n").slice(-100).join("\n");
    await writeFile(file, `${tail}\n`, "utf8");
  }
  return NextResponse.json({ ok: true });
}
