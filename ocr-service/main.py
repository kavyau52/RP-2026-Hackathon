"""Local, CPU-only OCR service backed by EasyOCR.

Accepts an image or PDF and returns the extracted text per page, in reading
order. Runs entirely on-device — no network calls, no cloud OCR APIs — so it
is safe to point at sensitive documents (billing statements, insurance forms,
etc.).
"""

import base64
import io
import json
import logging
from typing import List, TypedDict

import easyocr
import fitz  # PyMuPDF
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image, ImageDraw
from pydantic import BaseModel

import pii
from triage.languages import LANGUAGES
from triage.renderer import analysis_to_markdown
from triage.translator import translate_text
from triage.triage_model import deterministic_analysis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ocr-service")

# Render PDF pages at ~144 DPI by default. Raise this (e.g. 3.0 ≈ 216 DPI) if
# small print is getting missed; it costs proportionally more CPU time.
PDF_RENDER_ZOOM = 2.0


class Line(TypedDict):
    text: str
    confidence: float
    bbox: List[List[float]]


class Page(TypedDict):
    page: int
    text: str
    lines: List[Line]


app = FastAPI(title="Local OCR Service (EasyOCR, CPU-only)")

logger.info("Loading EasyOCR reader on CPU (gpu=False)... first run also downloads model weights.")
reader = easyocr.Reader(["en"], gpu=False)
logger.info("EasyOCR reader ready.")


def _run_easyocr(image: Image.Image) -> List[Line]:
    array = np.array(image.convert("RGB"))
    raw_results = reader.readtext(array)

    lines: List[Line] = [
        {
            "text": text,
            "confidence": round(float(confidence), 4),
            "bbox": [[float(x), float(y)] for x, y in bbox],
        }
        for bbox, text, confidence in raw_results
    ]

    # EasyOCR doesn't guarantee reading order; approximate top-to-bottom,
    # left-to-right using each box's top-left corner.
    lines.sort(key=lambda line: (line["bbox"][0][1], line["bbox"][0][0]))
    return lines


def _pdf_to_images(data: bytes) -> List[Image.Image]:
    images: List[Image.Image] = []
    matrix = fitz.Matrix(PDF_RENDER_ZOOM, PDF_RENDER_ZOOM)

    with fitz.open(stream=data, filetype="pdf") as doc:
        for page in doc:
            pixmap = page.get_pixmap(matrix=matrix)
            images.append(Image.open(io.BytesIO(pixmap.tobytes("png"))))

    return images


def _looks_like_pdf(content_type: str, filename: str) -> bool:
    return content_type == "application/pdf" or filename.lower().endswith(".pdf")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")

    is_pdf = _looks_like_pdf(file.content_type or "", file.filename or "")

    try:
        images = _pdf_to_images(data) if is_pdf else [Image.open(io.BytesIO(data))]
    except Exception as exc:  # noqa: BLE001 - surface a clean 400 either way
        raise HTTPException(status_code=400, detail=f"Could not read file: {exc}") from exc

    if not images:
        raise HTTPException(status_code=400, detail="No pages/images found in file.")

    pages: List[Page] = []
    for index, image in enumerate(images, start=1):
        lines = _run_easyocr(image)
        pages.append(
            {
                "page": index,
                "text": "\n".join(line["text"] for line in lines),
                "lines": lines,
            }
        )

    full_text = "\n\n".join(page["text"] for page in pages)

    return {
        "pageCount": len(pages),
        "pages": pages,
        "fullText": full_text,
    }


class PiiLineIn(BaseModel):
    text: str


class PiiPageIn(BaseModel):
    page: int
    lines: List[PiiLineIn]


class PiiRequest(BaseModel):
    pages: List[PiiPageIn]


@app.post("/pii")
async def detect_pii(payload: PiiRequest) -> dict:
    """Runs PII detection over already-extracted OCR text, line by line.

    Text-only and OCR-free, so this is cheap to call again after tuning
    thresholds without re-running EasyOCR.
    """
    out_pages = []
    total_entities = 0
    anonymized_full_parts = []

    for page in payload.pages:
        out_lines = []
        anonymized_lines = []
        page_entity_count = 0

        for line in page.lines:
            entities = pii.analyze(line.text)
            anonymized = pii.anonymize(line.text, entities) if entities else line.text

            out_lines.append(
                {
                    "text": line.text,
                    "pii": entities,
                    "redacted": bool(entities),
                    "anonymizedText": anonymized,
                }
            )
            anonymized_lines.append(anonymized)
            page_entity_count += len(entities)

        total_entities += page_entity_count
        page_anonymized_text = "\n".join(anonymized_lines)
        anonymized_full_parts.append(page_anonymized_text)

        out_pages.append(
            {
                "page": page.page,
                "anonymizedText": page_anonymized_text,
                "entityCount": page_entity_count,
                "lines": out_lines,
            }
        )

    return {
        "pageCount": len(out_pages),
        "entityCount": total_entities,
        "anonymizedText": "\n\n".join(anonymized_full_parts),
        "pages": out_pages,
    }


@app.post("/redact")
async def redact(file: UploadFile = File(...), pages: str = Form(...)) -> dict:
    """Whites out flagged regions on each page image.

    Takes the original file plus the per-line bbox + `redacted` flags
    (computed by /pii against the matching OCR result) and draws a filled
    white polygon over every flagged line. No OCR is re-run here — only
    page rasterization and drawing, so this stays fast even on CPU.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        pages_data = json.loads(pages)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid 'pages' JSON: {exc}") from exc

    is_pdf = _looks_like_pdf(file.content_type or "", file.filename or "")

    try:
        images = _pdf_to_images(data) if is_pdf else [Image.open(io.BytesIO(data))]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read file: {exc}") from exc

    if not images:
        raise HTTPException(status_code=400, detail="No pages/images found in file.")

    pages_by_number = {p.get("page"): p for p in pages_data}
    redacted_images_b64: List[str] = []
    canvases: List[Image.Image] = []

    for index, image in enumerate(images, start=1):
        page_info = pages_by_number.get(index, {})
        canvas = image.convert("RGB").copy()
        draw = ImageDraw.Draw(canvas)

        for line in page_info.get("lines", []):
            if not line.get("redacted"):
                continue
            bbox = line.get("bbox") or []
            if len(bbox) < 3:
                continue
            polygon = [(float(point[0]), float(point[1])) for point in bbox]
            draw.polygon(polygon, fill="white")

        buffer = io.BytesIO()
        canvas.save(buffer, format="PNG")
        redacted_images_b64.append(base64.b64encode(buffer.getvalue()).decode("ascii"))
        canvases.append(canvas)

    # Also assemble every redacted page into a single multi-page PDF, so the
    # result can be opened and verified as one file outside the browser.
    redacted_pdf_b64 = None
    if canvases:
        pdf_buffer = io.BytesIO()
        first_page, *rest_pages = canvases
        first_page.save(pdf_buffer, format="PDF", save_all=True, append_images=rest_pages)
        redacted_pdf_b64 = base64.b64encode(pdf_buffer.getvalue()).decode("ascii")

    return {
        "pageCount": len(redacted_images_b64),
        "redactedImages": redacted_images_b64,
        "redactedPdf": redacted_pdf_b64,
    }


class TriageRequest(BaseModel):
    text: str
    targetLanguage: str = "English only"


@app.get("/languages")
def list_languages() -> dict:
    return {"languages": list(LANGUAGES.keys())}


@app.post("/triage")
async def triage(payload: TriageRequest) -> dict:
    """Classifies a document, scores urgency, and builds a plain-language
    action plan — then translates the result into the requested language.

    Runs entirely on the already-OCR'd and PII-redacted text (never the raw
    document), via a tiny local scikit-learn model trained at import time
    from hardcoded examples plus deterministic templates. No API key is
    required: translation falls back to the free deep-translator library
    when no Google Cloud / OpenAI credentials are configured.
    """
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided to triage.")

    target_code = LANGUAGES.get(payload.targetLanguage, "en")

    analysis = deterministic_analysis(text)
    english_markdown = analysis_to_markdown(analysis)

    translated_markdown = english_markdown
    translation_method = "No translation needed"
    translation_warning = ""

    if target_code != "en":
        translated_markdown, translation_method, translation_warning = translate_text(
            english_markdown,
            target_language_name=payload.targetLanguage,
            target_code=target_code,
        )

    return {
        "analysis": analysis,
        "englishMarkdown": english_markdown,
        "translatedMarkdown": translated_markdown,
        "translationMethod": translation_method,
        "translationWarning": translation_warning,
    }
