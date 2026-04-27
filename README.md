# Structured Data Extractor - Nestack SDE Assessment

A Node.js REST service that converts unstructured financial text into clean,
database-ready JSON fields with per-field confidence and review flags.

This project includes:

- API endpoints for extraction and health checks
- A browser UI at /ui for manual testing
- Multi-provider LLM support (free local Ollama, Anthropic, OpenAI, and
  OpenAI-compatible gateways)

---

## What This Project Solves

Given raw text like receipts, email snippets, chat messages, or OCR output, the
service extracts:

- vendor_name
- amount
- currency
- date
- category
- description
- invoice_id

Each field includes its own confidence score and a needs_review flag so low
confidence values can be manually checked.

---

## Tech Stack

| Layer | Choice | Reason |
| ----- | ------ | ------ |
| Language | Node.js (v18+) | Fast I/O and easy JSON workflows |
| Framework | Express | Lightweight and stable for REST APIs |
| LLM Providers | Ollama, Anthropic, OpenAI-compatible | Provider can be switched by environment variables |
| Frontend | Vanilla HTML/CSS/JS | Zero build step, simple deployment |

---

## How It Works

1. Client sends raw text to POST /extract.
2. Service builds a strict extraction prompt.
3. Selected LLM provider returns structured JSON.
4. Service normalizes values (date, amount, casing).
5. Service applies confidence thresholds and review flags.
6. API returns standardized output.

---

## Prerequisites

- Node.js 18 or later
- npm
- One provider option:
  - Free local: Ollama (recommended)
  - Or hosted key-based providers (Anthropic/OpenAI/OpenAI-compatible)

---

## Quick Start (Recommended: Free Local Ollama)

### 1. Install dependencies

```bash
npm install
```

### 2. Create .env from template

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

### 3. Keep free provider config in .env

```env
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.1:8b
OLLAMA_BASE_URL=http://localhost:11434
PORT=3000
```

### 4. Install and run Ollama

```bash
ollama pull llama3.1:8b
ollama serve
```

### 5. Start API server

```bash
npm start
```

### 6. Open the UI

```text
http://localhost:3000/ui
```

---

## Provider Configuration

Use one provider at a time by setting LLM_PROVIDER.

### Ollama (free, local)

```env
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.1:8b
OLLAMA_BASE_URL=http://localhost:11434
```

### Anthropic

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4.1-mini
```

### OpenAI-compatible (OpenRouter, Groq, local gateways)

```env
LLM_PROVIDER=openai-compatible
OPENAI_API_KEY=your_compatible_key
OPENAI_MODEL=your_model_name
OPENAI_BASE_URL=https://your-endpoint/v1
```

---

## API Reference

### GET /

Health check endpoint.

Response:

```json
{ "status": "ok", "service": "structured-data-extractor" }
```

### GET /ui

Serves the browser UI for manual extraction.

### POST /extract

Request body:

```json
{ "text": "Paid Rs 1250 to AWS India on 12 March 2024. Invoice #INV-2024-0312." }
```

Response body:

```json
{
  "review_required": false,
  "fields": {
    "vendor_name": { "value": "AWS India Pvt Ltd", "confidence": 0.98, "needs_review": false },
    "amount": { "value": 1250, "confidence": 0.95, "needs_review": false },
    "currency": { "value": "INR", "confidence": 0.92, "needs_review": false },
    "date": { "value": "2024-03-12", "confidence": 0.97, "needs_review": false },
    "category": { "value": "software", "confidence": 0.88, "needs_review": false },
    "description": { "value": "Cloud compute services", "confidence": 0.91, "needs_review": false },
    "invoice_id": { "value": "INV-2024-0312", "confidence": 0.99, "needs_review": false }
  }
}
```

Possible error response:

```json
{ "error": "Request body must include a \"text\" string field." }
```

---

## Confidence and Review Logic

Prompt rubric used for each field:

| Score | Meaning |
| ----- | ------- |
| 1.00 | Explicitly present |
| 0.85 | Clearly implied |
| 0.70 | Ambiguous or partial |
| 0.40 | Weak guess only |
| 0.10 | No basis |

Review rule in code:

- needs_review = true when confidence < 0.75
- review_required = true when any field needs_review

---

## Post-processing Rules

After model output, values are normalized:

- date to YYYY-MM-DD when parseable
- amount to numeric float
- currency to uppercase
- category to lowercase

---

## Scripts

- npm start: Run API server
- npm dev: Run server with nodemon
- npm test: Run sample extraction suite and write results.json

---

## Troubleshooting

### ENOENT package.json

If npm cannot find package.json, run commands from the nested project folder:

```powershell
cd structured-data-extractor
npm start
```

### ANTHROPIC_API_KEY is required

You are using LLM_PROVIDER=anthropic without a key. For free local mode, set:

```env
LLM_PROVIDER=ollama
```

### ollama command not found

Install Ollama and restart terminal, then run:

```bash
ollama pull llama3.1:8b
ollama serve
```

### Could not reach Ollama at localhost:11434

Make sure Ollama is running and OLLAMA_BASE_URL matches your local setup.

### Port already in use

Set a different port in .env:

```env
PORT=3001
```

---

## Security Notes

- Do not commit real API keys to source control.
- Keep .env private.
- If a key is ever exposed, rotate/revoke it immediately.

---

## Project Structure

```text
project-root/
|-- src/
|   |-- server.js
|   |-- extractor.js
|   |-- runTests.js
|   `-- public/
|       |-- index.html
|       |-- styles.css
|       `-- app.js
|-- results.json
|-- .env.example
|-- package.json
`-- README.md
```
