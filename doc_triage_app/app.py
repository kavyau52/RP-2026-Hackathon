from __future__ import annotations

import os
from datetime import date

import streamlit as st
from dotenv import load_dotenv

from modules.ai_client import ai_analyze_document, ai_ocr_image, ai_translate_text, openai_available
from modules.languages import LANGUAGES
from modules.ocr import extract_text_from_file
from modules.renderer import analysis_to_markdown
from modules.translator import translate_text
from modules.triage_model import criticality_score, deterministic_analysis
from modules.utils import truncate

load_dotenv()

st.set_page_config(
    page_title="Crisis Document Triage",
    page_icon="🧭",
    layout="wide",
)

st.markdown(
    """
<style>
:root {
  --card-bg: #ffffff;
  --card-border: #d7dce2;
  --text-main: #102030;
  --muted: #52616f;
}
[data-testid="stAppViewContainer"] {
  background: #f6f8fb;
  color: #102030;
}
[data-testid="stSidebar"] {
  background: #eef3f8;
}
h1, h2, h3, h4, h5, h6, p, li, span, div {
  color: #102030;
}
.card {
  background: #ffffff;
  border: 1px solid #d7dce2;
  border-radius: 16px;
  padding: 18px 20px;
  margin: 12px 0;
  box-shadow: 0 2px 10px rgba(20, 35, 50, 0.04);
}
.metric-card {
  background: #ffffff;
  border: 1px solid #d7dce2;
  border-radius: 16px;
  padding: 16px;
  min-height: 110px;
}
.small-muted {
  color: #52616f;
  font-size: 0.92rem;
}
.critical {
  border-left: 8px solid #9b1c1c;
}
.high {
  border-left: 8px solid #b45309;
}
.moderate {
  border-left: 8px solid #2563eb;
}
.low {
  border-left: 8px solid #15803d;
}
.stButton>button {
  background: #102030;
  color: white;
  border-radius: 10px;
  border: 1px solid #102030;
  font-weight: 700;
}
.stButton>button:hover {
  background: #28465f;
  color: white;
  border: 1px solid #28465f;
}
.stDownloadButton>button {
  background: #ffffff;
  color: #102030;
  border-radius: 10px;
  border: 1px solid #102030;
  font-weight: 700;
}
textarea, input {
  color: #102030 !important;
  background: #ffffff !important;
}
</style>
""",
    unsafe_allow_html=True,
)

st.title("🧭 Crisis Document Triage")
st.write(
    "Upload a hospital bill, eviction notice, insurance denial, utility shutoff notice, or debt collection letter. "
    "The app extracts text, scores urgency, creates an action plan, and shows the result in English plus the selected language."
)

with st.sidebar:
    st.header("Settings")

    selected_language = st.selectbox(
        "Output language",
        list(LANGUAGES.keys()),
        index=list(LANGUAGES.keys()).index("Spanish") if "Spanish" in LANGUAGES else 0,
    )
    target_code = LANGUAGES[selected_language]

    ocr_mode = st.radio(
        "OCR mode",
        ["Auto", "Local OCR only", "AI OCR only"],
        index=0,
        help="Auto tries embedded PDF text, then local OCR, then AI OCR if configured.",
    )

    max_pages = st.slider("Max pages to process", 1, 15, 5)

    use_ai_analysis = st.toggle(
        "Use AI summary/action plan if API key exists",
        value=True,
        help="If off, the app uses the local deterministic triage engine only.",
    )

    translation_preference = st.selectbox(
        "Translation method",
        ["Auto", "Google Cloud Translation", "OpenAI translation", "Free fallback translator"],
        index=0,
    )

    st.divider()
    st.caption("API status")
    st.write("OpenAI configured:", "✅" if openai_available() else "Not configured")
    st.write("Google credentials:", "✅" if os.getenv("GOOGLE_APPLICATION_CREDENTIALS") else "Not configured")

uploaded = st.file_uploader(
    "Upload document",
    type=["pdf", "png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp", "txt", "csv", "docx"],
)

manual_text = st.text_area(
    "Or paste document text here",
    height=170,
    placeholder="Paste OCR text here if upload extraction fails...",
)

process = st.button("Analyze document", type="primary")

if process:
    if not uploaded and not manual_text.strip():
        st.error("Please upload a document or paste document text first.")
        st.stop()

    ai_ocr_func = ai_ocr_image if openai_available() else None

    extracted_text = ""
    ocr_result = None

    if uploaded:
        with st.spinner("Extracting text..."):
            ocr_result = extract_text_from_file(
                filename=uploaded.name,
                file_bytes=uploaded.getvalue(),
                mode=ocr_mode,
                ai_ocr_func=ai_ocr_func,
                max_pages=max_pages,
            )
            extracted_text = ocr_result.text

    if manual_text.strip():
        if extracted_text.strip():
            extracted_text = extracted_text + "\n\n[User pasted text / correction]\n" + manual_text.strip()
        else:
            extracted_text = manual_text.strip()

    extracted_text = extracted_text.strip()

    if not extracted_text:
        st.error(
            "I could not extract readable text. Try a clearer image, paste the text manually, "
            "or configure OpenAI AI OCR."
        )
        if ocr_result and ocr_result.warnings:
            with st.expander("OCR warnings"):
                for warning in ocr_result.warnings:
                    st.warning(warning)
        st.stop()

    if ocr_result:
        with st.expander("OCR details", expanded=False):
            st.write(f"**Method:** {ocr_result.method}")
            st.write(f"**Pages processed:** {ocr_result.pages_processed}")
            if ocr_result.warnings:
                for warning in ocr_result.warnings:
                    st.warning(warning)

    local_score = criticality_score(extracted_text, today=date.today())

    with st.spinner("Analyzing document..."):
        analysis = None
        ai_used = False
        ai_error = None

        if use_ai_analysis and openai_available():
            try:
                analysis = ai_analyze_document(extracted_text)
                ai_used = analysis is not None
            except Exception as exc:
                ai_error = str(exc)

        if analysis is None:
            analysis = deterministic_analysis(extracted_text)

        analysis.setdefault("criticality", {})
        analysis["criticality"]["local_model_score"] = local_score["score"]
        analysis["criticality"]["local_model_label"] = local_score["label"]

    english_markdown = analysis_to_markdown(analysis)

    translated_markdown = english_markdown
    translation_method = "No translation needed"
    translation_warning = ""

    if target_code != "en":
        with st.spinner("Translating output..."):
            translated_markdown, translation_method, translation_warning = translate_text(
                english_markdown,
                target_language_name=selected_language,
                target_code=target_code,
                prefer=translation_preference,
                ai_translate_func=ai_translate_text if openai_available() else None,
            )

    crit_label = str(analysis.get("criticality", {}).get("label", local_score["label"]))
    css_label = crit_label.lower() if crit_label.lower() in {"critical", "high", "moderate", "low"} else "moderate"

    st.markdown(f"<div class='card {css_label}'>", unsafe_allow_html=True)
    st.subheader("Triage result")
    cols = st.columns(4)
    cols[0].metric("Document type", analysis.get("document_type", "Unknown"))
    cols[1].metric("Urgency", crit_label)
    cols[2].metric("AI/score", f"{analysis.get('criticality', {}).get('score', local_score['score'])}/100")
    cols[3].metric("Local model", f"{local_score['label']} ({local_score['score']}/100)")
    st.markdown("</div>", unsafe_allow_html=True)

    if ai_error:
        st.warning(f"AI analysis failed, so local analysis was used: {ai_error}")
    st.caption(f"Analysis source: {'AI + local model' if ai_used else 'Local deterministic + ML model'}")
    st.caption(f"Translation source: {translation_method}")
    if translation_warning:
        st.warning(translation_warning)

    col_en, col_lang = st.columns(2)

    with col_en:
        st.markdown("<div class='card'>", unsafe_allow_html=True)
        st.subheader("English")
        st.markdown(english_markdown)
        st.markdown("</div>", unsafe_allow_html=True)

    with col_lang:
        st.markdown("<div class='card'>", unsafe_allow_html=True)
        st.subheader(selected_language)
        st.markdown(translated_markdown)
        st.markdown("</div>", unsafe_allow_html=True)

    with st.expander("Extracted text", expanded=False):
        st.text_area("OCR / extracted text", truncate(extracted_text, 20000), height=350)

    export_text = (
        f"# Crisis Document Triage Report\n\n"
        f"Generated by local prototype.\n\n"
        f"## English\n\n{english_markdown}\n\n"
        f"## {selected_language}\n\n{translated_markdown}\n\n"
        f"## Extracted text\n\n{truncate(extracted_text, 20000)}"
    )

    st.download_button(
        "Download report as Markdown",
        data=export_text,
        file_name="crisis_document_triage_report.md",
        mime="text/markdown",
    )

else:
    st.markdown(
        """
<div class="card">
<h3>What this app does</h3>
<ol>
<li><b>Extracts text</b> from PDF/image/DOCX/TXT documents.</li>
<li><b>Classifies</b> the document into one of the target crisis categories.</li>
<li><b>Scores criticality</b> using local ML + rules for deadlines, court/shutoff language, money, and urgency terms.</li>
<li><b>Creates an action plan</b> in plain English.</li>
<li><b>Translates</b> the same output into the selected language.</li>
</ol>
<p class="small-muted">This is a hackathon/MVP triage tool. It should not be presented as legal, medical, financial, or insurance advice.</p>
</div>
""",
        unsafe_allow_html=True,
    )
