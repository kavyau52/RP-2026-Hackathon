import { NextRequest, NextResponse } from "next/server";
import {
  getOcrResult,
  getPiiResult,
  readDocumentBytes,
  saveRedactedImages,
  saveRedactedPdf,
} from "@/lib/document-ingest";

export const runtime = "nodejs";

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL ?? "http://localhost:8001";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Whites out flagged regions on each page image, using the bounding boxes
 * from OCR and the `redacted` flags from PII detection. No OCR is re-run.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const [doc, ocr, pii] = await Promise.all([
    readDocumentBytes(id),
    getOcrResult(id),
    getPiiResult(id),
  ]);

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (!ocr) {
    return NextResponse.json(
      { error: "No OCR result yet. Run OCR before redaction." },
      { status: 400 }
    );
  }
  if (!pii) {
    return NextResponse.json(
      { error: "No PII result yet. Run PII detection before redaction." },
      { status: 400 }
    );
  }

  const pagesPayload = ocr.pages.map((ocrPage) => {
    const piiPage = pii.pages.find((p) => p.page === ocrPage.page);
    return {
      page: ocrPage.page,
      lines: ocrPage.lines.map((line, index) => ({
        bbox: line.bbox,
        redacted: piiPage?.lines[index]?.redacted ?? false,
      })),
    };
  });

  const form = new FormData();
  const bytes = new Uint8Array(doc.bytes);
  form.append(
    "file",
    new Blob([bytes], { type: doc.record.mimeType }),
    doc.record.originalName || `original${doc.ext}`
  );
  form.append("pages", JSON.stringify(pagesPayload));

  let res: Response;
  try {
    res = await fetch(`${OCR_SERVICE_URL}/redact`, { method: "POST", body: form });
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
      { error: `Redact service returned ${res.status}: ${detail}` },
      { status: 502 }
    );
  }

  const result = (await res.json()) as {
    pageCount: number;
    redactedImages: string[];
    redactedPdf: string | null;
  };
  await saveRedactedImages(id, result.redactedImages);
  if (result.redactedPdf) {
    await saveRedactedPdf(id, result.redactedPdf);
  }

  return NextResponse.json({
    ok: true,
    documentId: id,
    pageCount: result.pageCount,
    redactedImages: result.redactedImages.map(
      (b64) => `data:image/png;base64,${b64}`
    ),
    redactedPdfUrl: result.redactedPdf
      ? `/api/documents/${id}/redacted-pdf`
      : null,
  });
}
