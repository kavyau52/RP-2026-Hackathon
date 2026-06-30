from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from typing import Dict, List, Tuple

import numpy as np
from dateutil import parser
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from .utils import clean_text


@dataclass
class ModelPrediction:
    label: str
    confidence: float


DOC_TYPE_EXAMPLES = [
    ("hospital_bill", "hospital bill patient balance amount due itemized charges emergency room physician lab radiology payment plan charity care financial assistance"),
    ("hospital_bill", "medical center statement insurance adjustment patient responsibility bill due pay online account number"),
    ("hospital_bill", "clinic invoice hospital charges procedure date guarantor balance due uninsured discount"),
    ("eviction_notice", "eviction notice pay rent or quit unlawful detainer court hearing tenant landlord lease possession vacate premises"),
    ("eviction_notice", "notice to quit demand for possession rent owed court date summons complaint tenant response deadline"),
    ("eviction_notice", "landlord gives notice terminate tenancy failure to pay rent file eviction lawsuit"),
    ("insurance_denial", "insurance denial claim denied prior authorization appeal rights explanation of benefits not medically necessary"),
    ("insurance_denial", "coverage denied adverse benefit determination grievance appeal deadline insurer member id denial reason"),
    ("insurance_denial", "EOB claim rejected deductible authorization denied medical necessity appeal within days"),
    ("utility_shutoff", "utility shutoff disconnection notice electric gas water service disconnect past due final notice payment arrangement"),
    ("utility_shutoff", "notice of termination electricity will be disconnected pay by date energy assistance LIHEAP"),
    ("utility_shutoff", "water service shut off final bill overdue deposit reconnection fee"),
    ("debt_collection", "debt collection letter collector creditor validation notice amount owed dispute the debt thirty days"),
    ("debt_collection", "collection agency attempting to collect a debt account placed in collections FDCPA validation rights"),
    ("debt_collection", "past due account settlement offer creditor balance collections dispute in writing"),
]

URGENCY_EXAMPLES = [
    ("critical", "court date tomorrow eviction lockout shutoff today disconnected final notice respond immediately"),
    ("critical", "deadline 24 hours emergency termination lawsuit hearing tomorrow service will be shut off"),
    ("high", "pay or quit within 3 days appeal deadline within 7 days final disconnection notice"),
    ("high", "summons complaint response deadline past due utility termination claim denial appeal soon"),
    ("medium", "amount due collections validation rights bill due in 30 days payment plan available"),
    ("medium", "appeal within 60 days itemized bill requested financial assistance application"),
    ("low", "informational statement this is not a bill insurance processed no action required"),
    ("low", "receipt paid balance zero explanation of benefits informational duplicate copy"),
]

DISPLAY_DOC_TYPE = {
    "hospital_bill": "Hospital bill",
    "eviction_notice": "Eviction notice / housing notice",
    "insurance_denial": "Insurance denial",
    "utility_shutoff": "Utility shutoff notice",
    "debt_collection": "Debt collection letter",
    "unknown": "Unknown / needs review",
}

DOC_TYPE_BASE_SCORE = {
    "eviction_notice": 35,
    "utility_shutoff": 30,
    "insurance_denial": 22,
    "debt_collection": 20,
    "hospital_bill": 16,
    "unknown": 10,
}

URGENT_KEYWORDS = {
    "eviction": 15,
    "unlawful detainer": 20,
    "summons": 15,
    "court": 15,
    "hearing": 15,
    "vacate": 15,
    "pay or quit": 18,
    "shutoff": 18,
    "shut off": 18,
    "disconnect": 18,
    "termination": 14,
    "final notice": 14,
    "appeal": 8,
    "denied": 8,
    "collection": 8,
    "lawsuit": 18,
    "garnishment": 18,
    "past due": 7,
    "immediately": 12,
    "within 3 days": 20,
    "within three days": 20,
    "within 5 days": 16,
    "within five days": 16,
    "within 7 days": 14,
    "within seven days": 14,
    "30 days": 8,
}

MONEY_RE = re.compile(r"\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\$\s?\d+(?:\.\d{2})?")
PHONE_RE = re.compile(r"(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}")
DATE_PATTERNS = [
    r"\b\d{1,2}/\d{1,2}/\d{2,4}\b",
    r"\b\d{4}-\d{1,2}-\d{1,2}\b",
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}\b",
    r"\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4}\b",
]


def _training_pipeline(examples: List[Tuple[str, str]]) -> Pipeline:
    labels, texts = zip(*examples)
    pipe = Pipeline(
        [
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), lowercase=True, min_df=1)),
            ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ]
    )
    pipe.fit(texts, labels)
    return pipe


@lru_cache(maxsize=1)
def doc_type_model() -> Pipeline:
    return _training_pipeline(DOC_TYPE_EXAMPLES)


@lru_cache(maxsize=1)
def urgency_model() -> Pipeline:
    return _training_pipeline(URGENCY_EXAMPLES)


def predict_doc_type(text: str) -> ModelPrediction:
    text = clean_text(text)
    if len(text) < 20:
        return ModelPrediction("unknown", 0.0)

    pipe = doc_type_model()
    probabilities = pipe.predict_proba([text])[0]
    idx = int(np.argmax(probabilities))
    label = str(pipe.classes_[idx])
    confidence = float(probabilities[idx])

    if confidence < 0.32:
        return ModelPrediction("unknown", confidence)
    return ModelPrediction(label, confidence)


def predict_urgency(text: str) -> ModelPrediction:
    text = clean_text(text)
    if len(text) < 20:
        return ModelPrediction("low", 0.0)

    pipe = urgency_model()
    probabilities = pipe.predict_proba([text])[0]
    idx = int(np.argmax(probabilities))
    return ModelPrediction(str(pipe.classes_[idx]), float(probabilities[idx]))


def extract_money(text: str) -> List[str]:
    seen = []
    for match in MONEY_RE.findall(text or ""):
        cleaned = re.sub(r"\s+", "", match)
        if cleaned not in seen:
            seen.append(cleaned)
    return seen[:10]


def _money_to_float(value: str) -> float:
    try:
        return float(value.replace("$", "").replace(",", "").strip())
    except Exception:
        return 0.0


def extract_phone_numbers(text: str) -> List[str]:
    seen = []
    for match in PHONE_RE.findall(text or ""):
        if match not in seen:
            seen.append(match)
    return seen[:10]


def extract_dates(text: str) -> List[str]:
    matches: List[str] = []
    for pattern in DATE_PATTERNS:
        for match in re.findall(pattern, text or "", flags=re.IGNORECASE):
            if match not in matches:
                matches.append(match)
    return matches[:15]


def parsed_dates(text: str) -> List[date]:
    result: List[date] = []
    for raw in extract_dates(text):
        try:
            parsed = parser.parse(raw, fuzzy=True, dayfirst=False).date()
            result.append(parsed)
        except Exception:
            continue
    return result


def criticality_score(text: str, today: date | None = None) -> Dict:
    today = today or date.today()
    normalized = (text or "").lower()
    doc_pred = predict_doc_type(text)
    urgency_pred = predict_urgency(text)

    doc_type = doc_pred.label
    score = DOC_TYPE_BASE_SCORE.get(doc_type, 10)
    reasons: List[str] = [f"Document appears to be: {DISPLAY_DOC_TYPE.get(doc_type, doc_type)}."]

    urgency_add = {"critical": 25, "high": 18, "medium": 8, "low": 0}.get(urgency_pred.label, 0)
    score += urgency_add
    if urgency_add:
        reasons.append(f"Urgency model predicted: {urgency_pred.label}.")

    for keyword, weight in URGENT_KEYWORDS.items():
        if keyword in normalized:
            score += weight
            reasons.append(f"Found urgent phrase: “{keyword}”.")
            if len(reasons) >= 8:
                break

    dates = parsed_dates(text)
    upcoming = []
    past = []
    for d in dates:
        delta = (d - today).days
        if 0 <= delta <= 7:
            score += 22
            upcoming.append(d.isoformat())
        elif -14 <= delta < 0:
            score += 10
            past.append(d.isoformat())
        elif 8 <= delta <= 30:
            score += 8
    if upcoming:
        reasons.append(f"Deadline/date appears within 7 days: {', '.join(upcoming[:3])}.")
    if past:
        reasons.append(f"Some dates may already have passed: {', '.join(past[:3])}.")

    money_values = [_money_to_float(x) for x in extract_money(text)]
    max_money = max(money_values) if money_values else 0
    if max_money >= 5000:
        score += 15
        reasons.append("Large dollar amount detected.")
    elif max_money >= 1000:
        score += 10
        reasons.append("Significant dollar amount detected.")
    elif max_money >= 300:
        score += 5
        reasons.append("Dollar amount detected.")

    score = int(max(0, min(100, score)))

    if score >= 75:
        label = "Critical"
        time_window = "Act today / within 24 hours"
    elif score >= 50:
        label = "High"
        time_window = "Act within 48 hours"
    elif score >= 25:
        label = "Moderate"
        time_window = "Act this week"
    else:
        label = "Low"
        time_window = "Monitor and keep records"

    return {
        "score": score,
        "label": label,
        "time_window": time_window,
        "reasons": reasons[:8],
        "doc_type": doc_type,
        "doc_type_display": DISPLAY_DOC_TYPE.get(doc_type, "Unknown / needs review"),
        "doc_type_confidence": doc_pred.confidence,
        "urgency_prediction": urgency_pred.label,
        "urgency_confidence": urgency_pred.confidence,
        "dates": extract_dates(text),
        "money": extract_money(text),
        "phones": extract_phone_numbers(text),
    }


def action_plan_for_doc_type(doc_type: str, score_label: str) -> List[str]:
    shared = [
        "Take a clear photo or scan of every page and save a copy.",
        "Highlight deadlines, phone numbers, account numbers, claim numbers, and dollar amounts.",
        "Call the organization using the phone number on the official website or the document, and write down the date, time, name of the person, and reference number.",
    ]

    plans = {
        "eviction_notice": [
            "Look for a response deadline, court date, or “pay/quit” date. Do not ignore these dates.",
            "Contact a local tenant legal aid organization, tenant union, or courthouse self-help center as soon as possible.",
            "Gather lease, rent receipts, payment confirmations, repair requests, messages with the landlord, and any notices received.",
            "If there is a court hearing, plan to attend or respond by the required method even if you are trying to negotiate.",
        ],
        "utility_shutoff": [
            "Call the utility company immediately and ask for a payment arrangement, hardship plan, medical hold, or extension.",
            "Search for LIHEAP, local energy assistance, water assistance, or emergency rental/utility assistance in your city/county.",
            "Ask what exact payment is needed to stop disconnection and request the answer in writing if possible.",
            "If service is medically necessary, ask about a medical certificate or doctor form.",
        ],
        "insurance_denial": [
            "Find the denial reason, claim number, service date, appeal deadline, and appeal address.",
            "Call the insurer and ask for the exact appeal process and what documents they need.",
            "Ask the provider/doctor for a letter of medical necessity or corrected billing/coding if relevant.",
            "Submit the appeal before the deadline and keep proof of submission.",
        ],
        "debt_collection": [
            "Check whether the letter says you have 30 days to dispute or request validation of the debt.",
            "Do not admit the debt is yours until you verify it. Ask for debt validation in writing.",
            "Compare the collector name, creditor, account number, and amount with your own records.",
            "If the collector threatens illegal actions or keeps calling, document it and consider contacting legal aid or the CFPB/state attorney general.",
        ],
        "hospital_bill": [
            "Ask for an itemized bill and check for duplicate charges, wrong insurance, or services you did not receive.",
            "Apply for the hospital’s financial assistance/charity care program, even if the bill is already due.",
            "Ask whether Medicaid, emergency Medicaid, or a payment plan is available.",
            "Do not put the bill on a high-interest credit card before asking about discounts or assistance.",
        ],
        "unknown": [
            "Identify who sent the document, what they are asking you to do, and the deadline.",
            "Call the sender using a verified number and ask them to explain the next required step.",
            "If the document mentions court, housing, utilities, insurance, collections, or a deadline, treat it as urgent until confirmed otherwise.",
        ],
    }

    urgent_first = []
    if score_label in {"Critical", "High"}:
        urgent_first.append("Because this appears urgent, contact a qualified helper today if possible: legal aid, hospital billing advocate, insurance member services, utility assistance office, or a trusted community organization.")

    return urgent_first + plans.get(doc_type, plans["unknown"]) + shared


def resource_search_terms(doc_type: str) -> List[str]:
    terms = {
        "eviction_notice": ["local tenant legal aid", "eviction help near me", "courthouse self help tenant"],
        "utility_shutoff": ["LIHEAP application", "utility shutoff assistance", "emergency utility assistance near me"],
        "insurance_denial": ["health insurance appeal help", "state insurance department complaint", "patient advocate insurance denial"],
        "debt_collection": ["debt validation letter", "consumer financial protection bureau debt collection", "legal aid debt collection"],
        "hospital_bill": ["hospital charity care application", "medical bill financial assistance", "patient advocate hospital bill"],
        "unknown": ["legal aid near me", "community assistance navigator", "document help near me"],
    }
    return terms.get(doc_type, terms["unknown"])


def deterministic_analysis(text: str) -> Dict:
    score = criticality_score(text)
    doc_type = score["doc_type"]
    action_plan = action_plan_for_doc_type(doc_type, score["label"])

    summary_bits = []
    summary_bits.append(f"This appears to be a {score['doc_type_display'].lower()}.")
    if score["dates"]:
        summary_bits.append("Important dates found: " + ", ".join(score["dates"][:5]) + ".")
    if score["money"]:
        summary_bits.append("Possible money amounts found: " + ", ".join(score["money"][:5]) + ".")
    summary_bits.append(f"Criticality is {score['label'].lower()} with a score of {score['score']}/100.")
    if score["label"] in {"Critical", "High"}:
        summary_bits.append("The safest next step is to act quickly and speak to the sender or a qualified helper.")

    return {
        "document_type": score["doc_type_display"],
        "summary": " ".join(summary_bits),
        "criticality": {
            "label": score["label"],
            "score": score["score"],
            "time_window": score["time_window"],
            "reasons": score["reasons"],
            "model_doc_type_confidence": round(score["doc_type_confidence"], 3),
            "model_urgency": score["urgency_prediction"],
            "model_urgency_confidence": round(score["urgency_confidence"], 3),
        },
        "key_dates": score["dates"],
        "money_amounts": score["money"],
        "phone_numbers": score["phones"],
        "action_plan": action_plan,
        "resource_search_terms": resource_search_terms(doc_type),
        "disclaimer": "This is not legal, medical, financial, or insurance advice. It is a triage tool to help you understand possible urgency and next steps.",
    }
