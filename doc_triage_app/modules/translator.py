from __future__ import annotations

import os
from typing import Tuple

from dotenv import load_dotenv

load_dotenv()


def _chunk_text(text: str, max_chars: int = 4500):
    text = text or ""
    paragraphs = text.split("\n")
    chunks = []
    current = ""
    for para in paragraphs:
        addition = para + "\n"
        if len(current) + len(addition) > max_chars and current.strip():
            chunks.append(current.strip())
            current = addition
        else:
            current += addition
    if current.strip():
        chunks.append(current.strip())
    return chunks


def google_cloud_translate(text: str, target_code: str) -> str:
    from google.cloud import translate_v2 as translate

    client = translate.Client()
    translated_chunks = []
    for chunk in _chunk_text(text):
        result = client.translate(chunk, target_language=target_code, source_language="en", format_="text")
        translated_chunks.append(result["translatedText"])
    return "\n\n".join(translated_chunks)


def deep_translate(text: str, target_code: str) -> str:
    from deep_translator import GoogleTranslator

    translated_chunks = []
    target = {"zh-CN": "zh-CN", "zh-TW": "zh-TW"}.get(target_code, target_code)
    for chunk in _chunk_text(text, max_chars=4000):
        translated_chunks.append(GoogleTranslator(source="en", target=target).translate(chunk))
    return "\n\n".join(translated_chunks)


def translate_text(
    text: str,
    target_language_name: str,
    target_code: str,
    prefer: str = "Auto",
    ai_translate_func=None,
) -> Tuple[str, str, str]:
    """Return translated text, method, warning."""
    if not text or target_code == "en":
        return text, "No translation needed", ""

    methods = []
    if prefer == "Google Cloud Translation":
        methods = ["google", "ai", "deep"]
    elif prefer == "OpenAI translation":
        methods = ["ai", "google", "deep"]
    elif prefer == "Free fallback translator":
        methods = ["deep", "google", "ai"]
    else:
        methods = ["google", "ai", "deep"]

    errors = []

    for method in methods:
        try:
            if method == "google":
                if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
                    raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS is not set.")
                return google_cloud_translate(text, target_code), "Google Cloud Translation", ""
            if method == "ai":
                if ai_translate_func is None:
                    raise RuntimeError("AI translation function is not configured.")
                translated = ai_translate_func(text, target_language_name, target_code)
                if translated.strip():
                    return translated, "OpenAI translation", ""
                raise RuntimeError("AI returned empty translation.")
            if method == "deep":
                return deep_translate(text, target_code), "Free fallback translator", ""
        except Exception as exc:
            errors.append(f"{method}: {exc}")

    return text, "English fallback", "Translation failed, so English is shown. " + " | ".join(errors[:3])
