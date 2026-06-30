import { NextRequest, NextResponse } from "next/server";
import { readRedactedPdf } from "@/lib/document-ingest";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

/** Serves the saved redacted.pdf for a document, so it can be opened/verified directly. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const pdf = await readRedactedPdf(id);
  if (!pdf) {
    return NextResponse.json(
      { error: "No redacted PDF yet. Run redaction first." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="redacted-${id}.pdf"`,
    },
  });
}
