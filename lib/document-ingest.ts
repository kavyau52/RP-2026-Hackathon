import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const UPLOAD_ROOT = path.join(process.cwd(), "data", "documents");

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/heic",
  "image/heif",
]);

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/tiff": ".tiff",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const MAX_BYTES = 25 * 1024 * 1024;

export type DocumentRecord = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storedAt: string;
  status: "uploaded";
};

export class DocumentIngestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DocumentIngestError";
  }
}

function documentDir(id: string) {
  return path.join(UPLOAD_ROOT, id);
}

function metaPath(id: string) {
  return path.join(documentDir(id), "meta.json");
}

function originalPath(id: string, ext: string) {
  return path.join(documentDir(id), `original${ext}`);
}

function ocrPath(id: string) {
  return path.join(documentDir(id), "ocr.json");
}

function piiPath(id: string) {
  return path.join(documentDir(id), "pii.json");
}

function redactedDir(id: string) {
  return path.join(documentDir(id), "redacted");
}

function redactedImagePath(id: string, page: number) {
  return path.join(redactedDir(id), `page-${page}.png`);
}

function redactedPdfPath(id: string) {
  return path.join(documentDir(id), "redacted.pdf");
}

function triagePath(id: string) {
  return path.join(documentDir(id), "triage.json");
}

export function isAllowedMimeType(mimeType: string) {
  return ALLOWED_MIME_TYPES.has(mimeType);
}

export async function ingestDocument(
  file: File
): Promise<DocumentRecord> {
  if (!isAllowedMimeType(file.type)) {
    throw new DocumentIngestError(
      `Unsupported file type: ${file.type || "unknown"}. Use PDF or common image formats.`,
      415
    );
  }

  if (file.size === 0) {
    throw new DocumentIngestError("File is empty.", 400);
  }

  if (file.size > MAX_BYTES) {
    throw new DocumentIngestError(
      `File exceeds the ${MAX_BYTES / (1024 * 1024)}MB limit.`,
      413
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const ext = EXT_BY_MIME[file.type] ?? (path.extname(file.name) || ".bin");
  const id = randomUUID();
  const dir = documentDir(id);

  await mkdir(dir, { recursive: true });

  const record: DocumentRecord = {
    id,
    originalName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    sha256,
    storedAt: new Date().toISOString(),
    status: "uploaded",
  };

  await writeFile(originalPath(id, ext), bytes);
  await writeFile(metaPath(id), JSON.stringify(record, null, 2));

  return record;
}

export async function getDocumentRecord(
  id: string
): Promise<DocumentRecord | null> {
  try {
    const raw = await readFile(metaPath(id), "utf8");
    return JSON.parse(raw) as DocumentRecord;
  } catch {
    return null;
  }
}

export async function readDocumentBytes(id: string): Promise<{
  record: DocumentRecord;
  bytes: Buffer;
  ext: string;
} | null> {
  const record = await getDocumentRecord(id);
  if (!record) return null;

  const ext = EXT_BY_MIME[record.mimeType] ?? ".bin";
  const bytes = await readFile(originalPath(id, ext));
  return { record, bytes, ext };
}

export type OcrLine = {
  text: string;
  confidence: number;
  bbox: number[][];
};

export type OcrPage = {
  page: number;
  text: string;
  lines: OcrLine[];
};

export type OcrResult = {
  pageCount: number;
  fullText: string;
  pages: OcrPage[];
};

export async function saveOcrResult(
  id: string,
  result: OcrResult
): Promise<void> {
  await writeFile(ocrPath(id), JSON.stringify(result, null, 2));
}

export async function getOcrResult(id: string): Promise<OcrResult | null> {
  try {
    const raw = await readFile(ocrPath(id), "utf8");
    return JSON.parse(raw) as OcrResult;
  } catch {
    return null;
  }
}

export type PiiEntity = {
  entityType: string;
  start: number;
  end: number;
  score: number;
  text: string;
};

export type PiiLine = {
  text: string;
  pii: PiiEntity[];
  redacted: boolean;
  anonymizedText: string;
};

export type PiiPage = {
  page: number;
  anonymizedText: string;
  entityCount: number;
  lines: PiiLine[];
};

export type PiiResult = {
  pageCount: number;
  entityCount: number;
  anonymizedText: string;
  pages: PiiPage[];
};

export async function savePiiResult(
  id: string,
  result: PiiResult
): Promise<void> {
  await writeFile(piiPath(id), JSON.stringify(result, null, 2));
}

export async function getPiiResult(id: string): Promise<PiiResult | null> {
  try {
    const raw = await readFile(piiPath(id), "utf8");
    return JSON.parse(raw) as PiiResult;
  } catch {
    return null;
  }
}

export async function saveRedactedImages(
  id: string,
  base64Pngs: string[]
): Promise<void> {
  await mkdir(redactedDir(id), { recursive: true });
  await Promise.all(
    base64Pngs.map((b64, index) =>
      writeFile(redactedImagePath(id, index + 1), Buffer.from(b64, "base64"))
    )
  );
}

export async function saveRedactedPdf(
  id: string,
  base64Pdf: string
): Promise<void> {
  await writeFile(redactedPdfPath(id), Buffer.from(base64Pdf, "base64"));
}

export async function readRedactedPdf(id: string): Promise<Buffer | null> {
  try {
    return await readFile(redactedPdfPath(id));
  } catch {
    return null;
  }
}

export type TriageCriticality = {
  label: string;
  score: number;
  time_window: string;
  reasons: string[];
};

export type TriageAnalysis = {
  document_type: string;
  summary: string;
  criticality: TriageCriticality;
  key_dates: string[];
  money_amounts: string[];
  phone_numbers: string[];
  action_plan: string[];
  resource_search_terms: string[];
  disclaimer: string;
};

export type TriageResult = {
  analysis: TriageAnalysis;
  englishMarkdown: string;
  translatedMarkdown: string;
  translationMethod: string;
  translationWarning: string;
};

export async function saveTriageResult(
  id: string,
  result: TriageResult
): Promise<void> {
  await writeFile(triagePath(id), JSON.stringify(result, null, 2));
}

export async function getTriageResult(id: string): Promise<TriageResult | null> {
  try {
    const raw = await readFile(triagePath(id), "utf8");
    return JSON.parse(raw) as TriageResult;
  } catch {
    return null;
  }
}
