import { NextRequest, NextResponse } from "next/server";
import {
  getOcrResult,
  readDocumentBytes,
  saveOcrResult,
  type OcrResult,
} from "@/lib/document-ingest";

export const runtime = "nodejs";

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL ?? "http://localhost:8001";

type RouteParams = { params: Promise<{ id: string }> };

/** Runs (or re-runs) local OCR over a previously uploaded document. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const doc = await readDocumentBytes(id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const form = new FormData();
  const bytes = new Uint8Array(doc.bytes);
  form.append(
    "file",
    new Blob([bytes], { type: doc.record.mimeType }),
    doc.record.originalName || `original${doc.ext}`
  );

  let res: Response;
  try {
    res = await fetch(`${OCR_SERVICE_URL}/ocr`, { method: "POST", body: form });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json(
      {
        error: `Could not reach local OCR service at ${OCR_SERVICE_URL}. Is it running? (${message})`,
      },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: `OCR service returned ${res.status}: ${detail}` },
      { status: 502 }
    );
  }

  const result = (await res.json()) as OcrResult;
  await saveOcrResult(id, result);

  return NextResponse.json({ ok: true, documentId: id, ocr: result });
}

/** Returns a previously computed OCR result, if any. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const result = await getOcrResult(id);
  if (!result) {
    return NextResponse.json({ error: "No OCR result yet." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, documentId: id, ocr: result });
}
