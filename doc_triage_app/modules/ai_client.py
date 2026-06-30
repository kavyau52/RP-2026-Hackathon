from __future__ import annotations

import base64
import os
from typing import Dict, Optional

from dotenv import load_dotenv

from .utils import safe_json_loads, truncate

load_dotenv()


def _get_client():
    try:
        from openai import OpenAI
    except Exception as exc:
        raise RuntimeError("OpenAI package is not installed. Run: pip install openai") from exc

    azure_key = os.getenv("AZURE_OPENAI_API_KEY", "").strip()
    azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "").strip().rstrip("/")
    if azure_key and azure_endpoint:
        base_url = azure_endpoint
        if not base_url.endswith("/openai/v1"):
            base_url = base_url + "/openai/v1"
        return OpenAI(api_key=azure_key, base_url=base_url)

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("No OPENAI_API_KEY or AZURE_OPENAI_API_KEY configured.")
    return OpenAI(api_key=api_key)


def openai_available() -> bool:
    try:
        _get_client()
        return True
    except Exception:
        return False


def _model_name() -> str:
    return (
        os.getenv("AZURE_OPENAI_DEPLOYMENT", "").strip()
        or os.getenv("OPENAI_MODEL", "").strip()
        or "gpt-4.1-mini"
    )


def _image_data_url(image_bytes: bytes, mime_type: str = "image/png") -> str:
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"


def ai_ocr_image(image_bytes: bytes) -> str:
    client = _get_client()
    response = client.responses.create(
        model=_model_name(),
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Extract all readable text from this document image. "
                            "Preserve numbers, dates, dollar amounts, account numbers, phone numbers, and headings. "
                            "Do not summarize. Return only the extracted text."
                        ),
                    },
                    {"type": "input_image", "image_url": _image_data_url(image_bytes)},
                ],
            }
        ],
    )
    return getattr(response, "output_text", "") or ""


def ai_analyze_document(extracted_text: str) -> Optional[Dict]:
    client = _get_client()
    prompt = f"""
You are a crisis document triage assistant for people who may struggle with English or formal paperwork.

Analyze the document text and return STRICT JSON only.

Classify only among:
- Hospital bill
- Eviction notice / housing notice
- Insurance denial
- Utility shutoff notice
- Debt collection letter
- Unknown / needs review

Return JSON with this exact shape:
{{
  "document_type": "...",
  "summary": "Plain-language 4-6 sentence summary.",
  "criticality": {{
    "label": "Critical | High | Moderate | Low",
    "score": 0,
    "time_window": "Act today / within 24 hours | Act within 48 hours | Act this week | Monitor and keep records",
    "reasons": ["..."]
  }},
  "key_dates": ["..."],
  "money_amounts": ["..."],
  "phone_numbers": ["..."],
  "action_plan": ["specific step 1", "specific step 2", "specific step 3", "specific step 4", "specific step 5"],
  "resource_search_terms": ["..."],
  "disclaimer": "This is not legal, medical, financial, or insurance advice."
}}

Rules:
- Be practical and specific.
- Do not invent dates, phone numbers, organizations, or laws.
- If OCR is unclear, say what is uncertain.
- For eviction/court/shutoff/deadline documents, emphasize urgency.
- For debt collection, mention validation/dispute rights if the text suggests a collection notice.
- For hospital bills, mention itemized bill, financial assistance/charity care, and payment plan.
- For insurance denials, mention appeal deadline, denial reason, and member services.

DOCUMENT TEXT:
{truncate(extracted_text, 12000)}
"""
    response = client.responses.create(
        model=_model_name(),
        input=prompt,
    )
    raw = getattr(response, "output_text", "") or ""
    return safe_json_loads(raw)


def ai_translate_text(text: str, target_language_name: str, target_language_code: str) -> str:
    client = _get_client()
    prompt = f"""
Translate the following crisis-document guidance into {target_language_name} ({target_language_code}).

Important:
- Preserve markdown headings, bullets, numbers, dates, dollar amounts, phone numbers, and URLs.
- Use plain, respectful, easy-to-understand language.
- Do not add new facts.
- If a legal/medical term has no exact translation, keep the English term in parentheses.

TEXT:
{text}
"""
    response = client.responses.create(
        model=_model_name(),
        input=prompt,
    )
    return getattr(response, "output_text", "") or ""
