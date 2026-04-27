const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

const SUPPORTED_PROVIDERS = ['ollama', 'anthropic', 'openai', 'openai-compatible'];
const DEFAULT_PROVIDER = 'ollama';

const DEFAULT_MODELS = {
  ollama: 'llama3.1:8b',
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4.1-mini'
};

const REQUIRED_FIELDS = [
  'vendor_name', 'amount', 'currency', 'date', 'category'
];

const OPTIONAL_FIELDS = ['description', 'invoice_id'];

const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const REVIEW_THRESHOLD = 0.75;

let anthropicClient;
let openAIClient;

function getOllamaConfig() {
  return {
    baseUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, ''),
    model: process.env.OLLAMA_MODEL || DEFAULT_MODELS.ollama
  };
}

function getProvider() {
  const provider = (process.env.LLM_PROVIDER || DEFAULT_PROVIDER).toLowerCase();

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unsupported LLM_PROVIDER: "${provider}". Supported values: ${SUPPORTED_PROVIDERS.join(', ')}`
    );
  }

  return provider;
}

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic. For free local mode, set LLM_PROVIDER=ollama.');
  }

  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  return anthropicClient;
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai or openai-compatible. For free local mode, set LLM_PROVIDER=ollama.');
  }

  if (!openAIClient) {
    openAIClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined
    });
  }

  return openAIClient;
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildPrompt(text) {
  return `You are a structured data extraction engine for financial documents.

Given the raw text below, extract the following fields and return a JSON object.

For EACH field, provide:
  - "value": the extracted value (or null if absent/unclear)
  - "confidence": a float from 0.0 to 1.0 reflecting YOUR certainty for THAT
    specific field only — not the whole document.

Confidence scoring rules (apply independently per field):
  1.0  – Value is explicitly stated verbatim in the text
  0.85 – Value is clearly implied or easily inferred
  0.70 – Value is ambiguous, partially present, or requires guessing
  0.40 – Value is absent but weakly guessable from context
  0.10 – No basis for extraction; field is completely missing

Field definitions:
  vendor_name  (string)  – Name of the vendor/sender/company
  amount       (number)  – Total monetary value, numeric only (no symbols)
  currency     (string)  – ISO 4217 code, e.g. INR, USD, EUR
  date         (string)  – Transaction date in YYYY-MM-DD format
  category     (string)  – One of: food, travel, utilities, software, other
  description  (string)  – One-line summary of what the transaction is for
  invoice_id   (string)  – Invoice or reference number if present

Important:
- All five required fields (vendor_name, amount, currency, date, category) MUST
  appear in the response even if null.
- Scores must differ across fields; do NOT assign the same score to every field.
- If the text contains no transaction data at all, return null for every value
  and assign low confidence (0.05–0.20) to each field.

Return ONLY valid JSON with exactly this structure (no markdown, no explanation):
{
  "vendor_name":  { "value": <string|null>, "confidence": <float> },
  "amount":       { "value": <number|null>, "confidence": <float> },
  "currency":     { "value": <string|null>, "confidence": <float> },
  "date":         { "value": <string|null>, "confidence": <float> },
  "category":     { "value": <string|null>, "confidence": <float> },
  "description":  { "value": <string|null>, "confidence": <float> },
  "invoice_id":   { "value": <string|null>, "confidence": <float> }
}

Raw text:
"""
${text}
"""
`;
}

// ─── Post-processing ─────────────────────────────────────────────────────────

function normaliseDate(val) {
  if (!val) return null;

  // Already YYYY-MM-DD  (BUG FIX: original doc had `d{4}` — missing backslash)
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;

  // DD-MM-YYYY          (BUG FIX: same missing-backslash issue)
  const m1 = val.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;

  // "12 March 2024" / "April 2024"
  const d = new Date(val);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);

  return val; // Return as-is if we can't parse
}

function normaliseAmount(val) {
  if (val === null || val === undefined) return null;
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function applyReviewFlags(fields) {
  let reviewRequired = false;
  const result = {};

  for (const key of ALL_FIELDS) {
    const field = fields[key] ?? { value: null, confidence: 0.0 };
    const confidence = typeof field.confidence === 'number'
      ? Math.min(1, Math.max(0, field.confidence))
      : 0.0;

    const needsReview = confidence < REVIEW_THRESHOLD;
    if (needsReview) reviewRequired = true;

    result[key] = {
      value:       field.value ?? null,
      confidence:  parseFloat(confidence.toFixed(2)),
      needs_review: needsReview
    };
  }

  return { review_required: reviewRequired, fields: result };
}

function parseModelJson(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('LLM returned empty response');
  }

  const clean = raw.replace(/```json|```/gi, '').trim();

  try {
    return JSON.parse(clean);
  } catch (firstErr) {
    // Fallback: parse from the first JSON object in the text.
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');

    if (start !== -1 && end !== -1 && end > start) {
      const sliced = clean.slice(start, end + 1);
      return JSON.parse(sliced);
    }

    throw firstErr;
  }
}

async function callAnthropic(prompt) {
  const message = await getAnthropicClient().messages.create({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });

  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

async function callOpenAI(prompt) {
  const completion = await getOpenAIClient().chat.completions.create({
    model: process.env.OPENAI_MODEL || DEFAULT_MODELS.openai,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }]
  });

  return completion.choices?.[0]?.message?.content || '';
}

async function callOllama(prompt) {
  const config = getOllamaConfig();

  let response;

  try {
    response = await fetch(`${config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0 }
      })
    });
  } catch (err) {
    throw new Error(
      `Could not reach Ollama at ${config.baseUrl}. Start Ollama and pull model "${config.model}".`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Ollama request failed (${response.status}). Ensure Ollama is running and model "${config.model}" is available.`
    );
  }

  const data = await response.json();

  if (!data.response || typeof data.response !== 'string') {
    throw new Error('Ollama returned an invalid response payload.');
  }

  return data.response;
}

// ─── Main extraction function ─────────────────────────────────────────────────

async function extractFields(text) {
  const prompt = buildPrompt(text);
  const provider = getProvider();

  let raw;

  switch (provider) {
    case 'ollama':
      raw = await callOllama(prompt);
      break;
    case 'anthropic':
      raw = await callAnthropic(prompt);
      break;
    default:
      raw = await callOpenAI(prompt);
      break;
  }

  const parsed = parseModelJson(raw);

  // Post-process values
  if (parsed.date)     parsed.date.value     = normaliseDate(parsed.date.value);
  if (parsed.amount)   parsed.amount.value   = normaliseAmount(parsed.amount.value);
  if (parsed.currency && parsed.currency.value)
    parsed.currency.value = parsed.currency.value.toUpperCase();
  if (parsed.category && parsed.category.value)
    parsed.category.value = parsed.category.value.toLowerCase();

  return applyReviewFlags(parsed);
}

module.exports = { extractFields };
