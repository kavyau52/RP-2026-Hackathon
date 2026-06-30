import { NextRequest, NextResponse } from "next/server";
import {
  getOcrResult,
  getPiiResult,
  savePiiResult,
  type PiiResult,
} from "@/lib/document-ingest";

export const runtime = "nodejs";

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL ?? "http://localhost:8001";

type RouteParams = { params: Promise<{ id: string }> };

/** Runs local PII/PHI detection over a document's already-extracted OCR text. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const ocr = await getOcrResult(id);
  if (!ocr) {
    return NextResponse.json(
      { error: "No OCR result yet. Run OCR before PII detection." },
      { status: 400 }
    );
  }

  const body = {
    pages: ocr.pages.map((page) => ({
      page: page.page,
      lines: page.lines.map((line) => ({ text: line.text })),
    })),
  };

  let res: Response;
  try {
    res = await fetch(`${OCR_SERVICE_URL}/pii`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
      { error: `PII service returned ${res.status}: ${detail}` },
      { status: 502 }
    );
  }

  const result = (await res.json()) as PiiResult;
  await savePiiResult(id, result);

  return NextResponse.json({ ok: true, documentId: id, pii: result });
}

/** Returns a previously computed PII result, if any. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const result = await getPiiResult(id);
  if (!result) {
    return NextResponse.json({ error: "No PII result yet." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, documentId: id, pii: result });
}
