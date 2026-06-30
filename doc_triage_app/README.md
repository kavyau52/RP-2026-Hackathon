# Crisis Document Triage App

A working Streamlit prototype for uploading high-stakes documents such as:

- Hospital bills
- Eviction notices
- Insurance denials
- Utility shutoff notices
- Debt collection letters

The app extracts text, classifies document type, scores criticality, creates an English summary and action plan, then translates the output into a selected language.

## What works without any API key

- PDF text extraction
- Image/PDF OCR using local Tesseract
- Document type classification using a lightweight local scikit-learn model
- Criticality scoring using model + deadline/keyword/money signals
- English summary and action plan using deterministic templates

## Optional upgrades

- OpenAI API: AI OCR and better summary/action plan
- Google Cloud Translation API: production-grade translation
- deep-translator fallback: free translation fallback for demos

## Install

```bash
cd doc_triage_app
python -m venv .venv
source .venv/bin/activate        # Mac/Linux
# .venv\Scripts\activate       # Windows

pip install -r requirements.txt
```

## Install Tesseract OCR

Local OCR requires the Tesseract binary.

Mac:

```bash
brew install tesseract
```

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr
```

Windows:

Install Tesseract from UB Mannheim builds, then add the install folder to PATH.

## Run

```bash
streamlit run app.py
```

## Optional API setup

```bash
cp .env.example .env
```

Then fill in either:

```bash
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
```

or Azure OpenAI:

```bash
AZURE_OPENAI_API_KEY=your_key
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE-NAME.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=your_deployment_name
```

For Google Cloud Translation:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

## Safety note

This tool is a triage assistant, not a lawyer, doctor, financial advisor, or government agency. It should help users understand urgency and next steps, but not replace professional advice.
