import { NextRequest, NextResponse } from "next/server";
import {
  getPiiResult,
  getTriageResult,
  saveTriageResult,
  type TriageResult,
} from "@/lib/document-ingest";

export const runtime = "nodejs";

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL ?? "http://localhost:8001";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Runs crisis-document triage (type, urgency, action plan, translation) on
 * the document's *sanitized* text — i.e. the PII-anonymized output of /pii,
 * never the raw OCR text. Names/SSNs/addresses/etc. never reach this step
 * or the translation call.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const pii = await getPiiResult(id);
  if (!pii) {
    return NextResponse.json(
      { error: "No PII result yet. Run PII detection before triage." },
      { status: 400 }
    );
  }

  let targetLanguage = "English only";
  try {
    const body = await req.json();
    if (typeof body?.targetLanguage === "string" && body.targetLanguage) {
      targetLanguage = body.targetLanguage;
    }
  } catch {
    // No JSON body provided — fall back to the default language.
  }

  let res: Response;
  try {
    res = await fetch(`${OCR_SERVICE_URL}/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: pii.anonymizedText, targetLanguage }),
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
      { error: `Triage service returned ${res.status}: ${detail}` },
      { status: 502 }
    );
  }

  const result = (await res.json()) as TriageResult;
  await saveTriageResult(id, result);

  return NextResponse.json({ ok: true, documentId: id, triage: result });
}

/** Returns a previously computed triage result, if any. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const result = await getTriageResult(id);
  if (!result) {
    return NextResponse.json({ error: "No triage result yet." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, documentId: id, triage: result });
}
