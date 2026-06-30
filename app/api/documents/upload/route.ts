import { NextRequest, NextResponse } from "next/server";
import {
  DocumentIngestError,
  ingestDocument,
} from "@/lib/document-ingest";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing "file" in multipart form data.' },
        { status: 400 }
      );
    }

    const record = await ingestDocument(file);

    return NextResponse.json({
      ok: true,
      document: record,
    });
  } catch (err) {
    if (err instanceof DocumentIngestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[/api/documents/upload]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
