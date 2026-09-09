import { createWorker } from "tesseract.js";
import { PDFParse } from "pdf-parse";

export async function extractPdfText(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

export async function extractImageText(buf: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    const ret = await worker.recognize(buf);
    return ret.data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

export async function extractDocumentText(buf: Buffer, mime: string): Promise<string> {
  if (mime === "application/pdf" || mime.includes("pdf")) {
    return extractPdfText(buf);
  }
  return extractImageText(buf);
}
