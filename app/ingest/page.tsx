"use client";

import { useState } from "react";
import type {
  DocumentRecord,
  OcrResult,
  PiiResult,
  TriageResult,
} from "@/lib/document-ingest";

type Stage = "idle" | "uploading" | "ocr" | "pii" | "redact" | "triage";

// Mirrors ocr-service/triage/languages.py — kept here so the picker doesn't
// need a network round trip before the user can even pick a language.
const LANGUAGES = [
  "English only",
  "Spanish",
  "Hindi",
  "Arabic",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Bengali",
  "Urdu",
  "French",
  "Portuguese",
  "Vietnamese",
  "Tagalog / Filipino",
  "Haitian Creole",
  "Korean",
  "Russian",
  "Ukrainian",
  "Swahili",
  "Amharic",
  "Quechua",
  "Nahuatl",
];

export default function IngestPage() {
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [pii, setPii] = useState<PiiResult | null>(null);
  const [redactedImages, setRedactedImages] = useState<string[]>([]);
  const [redactedPdfUrl, setRedactedPdfUrl] = useState<string | null>(null);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [language, setLanguage] = useState("Spanish");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [docId, setDocId] = useState<string | null>(null);

  async function postJson(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      ...(body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `${url} failed.`);
    return data;
  }

  async function runTriage(id: string, targetLanguage: string) {
    setStage("triage");
    const triageData = await postJson(`/api/documents/${id}/triage`, { targetLanguage });
    setTriage(triageData.triage);
    setStage("idle");
  }

  async function onFile(file: File) {
    setError(null);
    setDoc(null);
    setOcr(null);
    setPii(null);
    setRedactedImages([]);
    setRedactedPdfUrl(null);
    setTriage(null);
    setDocId(null);

    try {
      setStage("uploading");
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch("/api/documents/upload", {
        method: "POST",
        body: form,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error ?? "Upload failed.");
      setDoc(uploadData.document);
      const id = uploadData.document.id as string;
      setDocId(id);

      setStage("ocr");
      const ocrData = await postJson(`/api/documents/${id}/ocr`);
      setOcr(ocrData.ocr);

      setStage("pii");
      const piiData = await postJson(`/api/documents/${id}/pii`);
      setPii(piiData.pii);

      setStage("redact");
      const redactData = await postJson(`/api/documents/${id}/redact`);
      setRedactedImages(redactData.redactedImages ?? []);
      setRedactedPdfUrl(redactData.redactedPdfUrl ?? null);

      // Triage runs on the sanitized (anonymized) text only — never the
      // raw OCR text — so PII never reaches the classifier or translator.
      await runTriage(id, language);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStage("idle");
    }
  }

  return (
    <main style={{ padding: "1rem" }}>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.tif,application/pdf,image/*"
        disabled={stage !== "idle"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      {" "}
      <select
        value={language}
        disabled={stage !== "idle"}
        onChange={(e) => setLanguage(e.target.value)}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {lang}
          </option>
        ))}
      </select>
      {docId && (
        <button
          disabled={stage !== "idle"}
          onClick={() => {
            void (async () => {
              setError(null);
              try {
                await runTriage(docId, language);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong.");
                setStage("idle");
              }
            })();
          }}
        >
          re-run triage in this language
        </button>
      )}
      {stage === "uploading" && <p>uploading…</p>}
      {stage === "ocr" && <p>running local OCR (EasyOCR, CPU)…</p>}
      {stage === "pii" && <p>scanning for PII (Presidio + spaCy, CPU)…</p>}
      {stage === "redact" && <p>whiting out flagged regions…</p>}
      {stage === "triage" && <p>classifying document + building action plan…</p>}
      {error && <pre>{error}</pre>}

      {doc && (
        <details>
          <summary>document</summary>
          <pre>{JSON.stringify(doc, null, 2)}</pre>
        </details>
      )}

      {ocr && (
        <>
          <h3>
            extracted text ({ocr.pageCount} page{ocr.pageCount === 1 ? "" : "s"})
          </h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{ocr.fullText}</pre>
        </>
      )}

      {pii && (
        <>
          <h3>
            anonymized text ({pii.entityCount} entit
            {pii.entityCount === 1 ? "y" : "ies"} flagged)
          </h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{pii.anonymizedText}</pre>
        </>
      )}

      {redactedPdfUrl && (
        <p>
          <a href={redactedPdfUrl} target="_blank" rel="noreferrer">
            open redacted PDF
          </a>
        </p>
      )}

      {redactedImages.length > 0 && (
        <>
          <h3>redacted page images</h3>
          {redactedImages.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={`redacted page ${i + 1}`}
              style={{
                maxWidth: "100%",
                border: "1px solid #ccc",
                marginBottom: "1rem",
                display: "block",
              }}
            />
          ))}
        </>
      )}

      {triage && (
        <>
          <h3>
            triage result — {triage.analysis.document_type} (
            {triage.analysis.criticality.label}, {triage.analysis.criticality.score}/100)
          </h3>
          <p>
            <em>{triage.translationMethod}</em>
            {triage.translationWarning ? ` — ${triage.translationWarning}` : ""}
          </p>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <h4>English</h4>
              <pre style={{ whiteSpace: "pre-wrap" }}>{triage.englishMarkdown}</pre>
            </div>
            <div style={{ flex: 1, minWidth: 300 }}>
              <h4>{language}</h4>
              <pre style={{ whiteSpace: "pre-wrap" }}>{triage.translatedMarkdown}</pre>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
