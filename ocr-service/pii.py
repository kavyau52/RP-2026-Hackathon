"""Local PII/PHI detection and anonymization (Presidio + spaCy), CPU-only.

Everything below runs on-device, with no network calls at inference time:
  - Presidio's built-in recognizers cover SSNs, credit cards, phone numbers,
    emails, bank/license/passport numbers, etc.
  - spaCy's small English model (`en_core_web_sm`) supplies NER — mainly for
    PERSON — via Presidio's NLP engine. Deliberately the small model, not
    `lg`, to keep this fast and light on CPU.
  - A generic, context-boosted "ID-like" regex recognizer stands in for
    member/policy/account/claim numbers. These vary by issuer and can't be
    enumerated as fixed formats ahead of time, so instead we flag
    alphanumeric tokens that sit near label words like "member", "policy",
    "account", "claim", etc. Presidio only applies the context boost (and
    therefore only crosses the score threshold) when such a label word is
    nearby, which keeps it from flagging arbitrary numbers on the page.
"""

import logging
from typing import List, TypedDict

from presidio_analyzer import (
    AnalyzerEngine,
    Pattern,
    PatternRecognizer,
    RecognizerResult,
)
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig

logger = logging.getLogger("ocr-service.pii")

# Bias toward over-flagging rather than under-flagging: a false-positive
# whiteout is cheap, a missed identifier is not.
DEFAULT_SCORE_THRESHOLD = 0.35

# Presidio also detects generic DATE_TIME and ORGANIZATION, but billing
# statements need their service/due dates and provider names to stay
# legible. We redact things that identify a specific person — including
# their address and date of birth, which get their own targeted recognizers
# below rather than blanket-redacting every date or location on the page.
REDACT_ENTITY_TYPES = {
    "PERSON",
    "US_SSN",
    "CREDIT_CARD",
    "PHONE_NUMBER",
    "EMAIL_ADDRESS",
    "US_BANK_NUMBER",
    "US_DRIVER_LICENSE",
    "US_PASSPORT",
    "IBAN_CODE",
    "MEDICAL_LICENSE",
    "CRYPTO",
    "ID_LIKE_NUMBER",
    "LOCATION",
    "STREET_ADDRESS",
    "COUNTRY_NAME",
    "DOB",
}

_ID_LIKE_PATTERN = Pattern(
    name="id_like_number",
    regex=r"\b[A-Za-z]{0,5}[-#]?\d[\dA-Za-z-]{3,}\b",
    score=0.3,
)

_ID_LIKE_CONTEXT = [
    "member", "policy", "account", "acct", "claim", "group", "id",
    "number", "no", "subscriber", "patient", "mrn", "invoice", "card",
]

# Street addresses (e.g. "1499 Lynn Street") have no NER coverage at all by
# default — spaCy's small model doesn't reliably tag them, so this is a
# dedicated regex: a leading street number, a short run of words, then a
# common street-type suffix.
_STREET_ADDRESS_PATTERN = Pattern(
    name="street_address",
    regex=(
        r"\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+"
        r"(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|"
        r"Court|Ct|Way|Place|Pl|Circle|Cir|Terrace|Ter|Highway|Hwy|"
        r"Parkway|Pkwy|Square|Sq)\.?\b"
    ),
    score=0.5,
)

# spaCy's small model tags country names like "UNITED STATES" as
# ORGANIZATION rather than LOCATION (verified empirically), so this catches
# the common ones directly instead of relying on NER for them.
_COUNTRY_NAME_PATTERN = Pattern(
    name="country_name",
    regex=r"\b(UNITED STATES(?: OF AMERICA)?|U\.S\.A\.?|USA)\b",
    score=0.6,
)

# A date is only someone's date of birth if it's labeled as such. Without
# the context boost this scores 0.3 (below the default 0.35 threshold), so
# unrelated dates (service date, due date, statement date, etc.) are left
# alone — only dates near "DOB"/"birth"/"born" get flagged.
_DOB_DATE_PATTERN = Pattern(
    name="dob_date",
    regex=r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
    score=0.3,
)

_DOB_CONTEXT = ["dob", "birth", "born", "birthdate", "birthday"]


def _build_analyzer() -> AnalyzerEngine:
    provider = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
        }
    )
    nlp_engine = provider.create_engine()
    analyzer = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])

    analyzer.registry.add_recognizer(
        PatternRecognizer(
            supported_entity="ID_LIKE_NUMBER",
            patterns=[_ID_LIKE_PATTERN],
            context=_ID_LIKE_CONTEXT,
        )
    )
    analyzer.registry.add_recognizer(
        PatternRecognizer(
            supported_entity="STREET_ADDRESS",
            patterns=[_STREET_ADDRESS_PATTERN],
        )
    )
    analyzer.registry.add_recognizer(
        PatternRecognizer(
            supported_entity="COUNTRY_NAME",
            patterns=[_COUNTRY_NAME_PATTERN],
        )
    )
    analyzer.registry.add_recognizer(
        PatternRecognizer(
            supported_entity="DOB",
            patterns=[_DOB_DATE_PATTERN],
            context=_DOB_CONTEXT,
        )
    )
    return analyzer


logger.info("Loading Presidio analyzer (spaCy en_core_web_sm, CPU-only)...")
_analyzer = _build_analyzer()
_anonymizer = AnonymizerEngine()
logger.info("Presidio analyzer ready.")


class PiiEntity(TypedDict):
    entityType: str
    start: int
    end: int
    score: float
    text: str


def analyze(text: str, threshold: float = DEFAULT_SCORE_THRESHOLD) -> List[PiiEntity]:
    if not text or not text.strip():
        return []

    results = _analyzer.analyze(text=text, language="en")
    entities: List[PiiEntity] = []
    for r in results:
        if r.entity_type not in REDACT_ENTITY_TYPES:
            continue
        if r.score < threshold:
            continue
        entities.append(
            {
                "entityType": r.entity_type,
                "start": r.start,
                "end": r.end,
                "score": round(float(r.score), 4),
                "text": text[r.start : r.end],
            }
        )
    return entities


def anonymize(text: str, entities: List[PiiEntity]) -> str:
    if not entities:
        return text

    presidio_results = [
        RecognizerResult(
            entity_type=e["entityType"],
            start=e["start"],
            end=e["end"],
            score=e["score"],
        )
        for e in entities
    ]

    operators = {"DEFAULT": OperatorConfig("replace", {"new_value": "[REDACTED]"})}
    for entity_type in {e["entityType"] for e in entities}:
        operators[entity_type] = OperatorConfig(
            "replace", {"new_value": f"[{entity_type}]"}
        )

    result = _anonymizer.anonymize(
        text=text, analyzer_results=presidio_results, operators=operators
    )
    return result.text
