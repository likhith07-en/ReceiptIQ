const FIELD_META = [
  ['vendor_name', 'Vendor Name'],
  ['amount', 'Amount'],
  ['currency', 'Currency'],
  ['date', 'Date'],
  ['category', 'Category'],
  ['description', 'Description'],
  ['invoice_id', 'Invoice ID']
];

const SAMPLE_INPUTS = [
  {
    label: 'Clean receipt',
    text: 'Paid Rs 1250 to AWS India Pvt Ltd on 12 March 2024. Invoice #INV-2024-0312. Services: cloud compute.'
  },
  {
    label: 'Vendor email',
    text: 'Please find invoice from Zoho Corp for Rs 4800 (software subscription, April 2024). Reference: ZHO-88821.'
  },
  {
    label: 'Casual message',
    text: 'Can someone reimburse me for the uber last Tuesday? It was about 340 rupees for the airport trip.'
  }
];

const extractForm = document.getElementById('extractForm');
const inputText = document.getElementById('inputText');
const extractBtn = document.getElementById('extractBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const statusBadge = document.getElementById('statusBadge');
const resultHint = document.getElementById('resultHint');
const summary = document.getElementById('summary');
const fieldsGrid = document.getElementById('fieldsGrid');
const rawWrap = document.getElementById('rawWrap');
const rawJson = document.getElementById('rawJson');
const sampleButtons = document.getElementById('sampleButtons');

let latestResult = null;

function setStatus(label, tone) {
  statusBadge.textContent = label;
  statusBadge.className = `badge ${tone}`;
}

function setLoading(loading) {
  extractBtn.disabled = loading;
  clearBtn.disabled = loading;
  setStatus(loading ? 'Extracting...' : 'Idle', loading ? 'loading' : 'neutral');
}

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return 'Not found';

  if (key === 'amount' && typeof value === 'number') {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  return String(value);
}

function addSummaryTokens(result) {
  summary.innerHTML = '';

  const total = FIELD_META.length;
  const reviewCount = Object.values(result.fields || {}).filter(
    (field) => field && field.needs_review
  ).length;

  const tokens = [
    `Total fields: ${total}`,
    `Needs review: ${reviewCount}`,
    `Overall review_required: ${result.review_required ? 'true' : 'false'}`
  ];

  for (const tokenText of tokens) {
    const token = document.createElement('span');
    token.className = 'token';
    token.textContent = tokenText;
    summary.appendChild(token);
  }

  summary.classList.remove('hidden');
}

function createFieldCard([key, title], fieldData, index) {
  const field = fieldData || { value: null, confidence: 0, needs_review: true };
  const confidence = typeof field.confidence === 'number'
    ? Math.max(0, Math.min(1, field.confidence))
    : 0;

  const card = document.createElement('article');
  card.className = 'field-card';
  card.style.animationDelay = `${index * 50}ms`;

  const top = document.createElement('div');
  top.className = 'field-top';

  const name = document.createElement('span');
  name.className = 'field-name';
  name.textContent = title;

  top.appendChild(name);

  if (field.needs_review) {
    const reviewFlag = document.createElement('span');
    reviewFlag.className = 'review-flag';
    reviewFlag.textContent = 'Needs review';
    top.appendChild(reviewFlag);
  }

  const value = document.createElement('div');
  value.className = 'field-value';
  value.textContent = formatValue(key, field.value);
  if (field.value === null || field.value === undefined || field.value === '') {
    value.classList.add('empty');
  }

  const meterRow = document.createElement('div');
  meterRow.className = 'meter-row';

  const bar = document.createElement('div');
  bar.className = 'confidence-bar';

  const fill = document.createElement('div');
  fill.className = 'confidence-fill';
  fill.style.width = `${Math.round(confidence * 100)}%`;

  bar.appendChild(fill);

  const label = document.createElement('span');
  label.className = 'confidence-label';
  label.textContent = `${Math.round(confidence * 100)}%`;

  meterRow.appendChild(bar);
  meterRow.appendChild(label);

  card.appendChild(top);
  card.appendChild(value);
  card.appendChild(meterRow);

  return card;
}

function renderResult(result) {
  latestResult = result;

  fieldsGrid.innerHTML = '';
  addSummaryTokens(result);

  FIELD_META.forEach((meta, index) => {
    const card = createFieldCard(meta, result.fields?.[meta[0]], index);
    fieldsGrid.appendChild(card);
  });

  rawJson.textContent = JSON.stringify(result, null, 2);
  rawWrap.classList.remove('hidden');

  const reviewCount = Object.values(result.fields || {}).filter(
    (field) => field && field.needs_review
  ).length;

  resultHint.textContent =
    reviewCount === 0
      ? 'All fields are above the review threshold.'
      : `${reviewCount} field(s) are below threshold and need human review.`;

  if (result.review_required) {
    setStatus('Review required', 'warn');
  } else {
    setStatus('Extraction complete', 'ok');
  }
}

function renderError(message) {
  resultHint.textContent = message;
  fieldsGrid.innerHTML = '';
  summary.classList.add('hidden');
  rawWrap.classList.add('hidden');
  setStatus('Request failed', 'error');
}

function buildSampleButtons() {
  sampleButtons.innerHTML = '';

  SAMPLE_INPUTS.forEach((sample) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = sample.label;
    button.addEventListener('click', () => {
      inputText.value = sample.text;
      inputText.focus();
    });

    sampleButtons.appendChild(button);
  });
}

extractForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const text = inputText.value.trim();
  if (!text) {
    renderError('Please enter some transaction text first.');
    return;
  }

  setLoading(true);
  resultHint.textContent = 'Calling extractor API...';

  try {
    const response = await fetch('/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }

    renderResult(payload);
  } catch (error) {
    renderError(error.message || 'Unexpected error while extracting fields.');
  } finally {
    extractBtn.disabled = false;
    clearBtn.disabled = false;
  }
});

clearBtn.addEventListener('click', () => {
  inputText.value = '';
  inputText.focus();

  latestResult = null;
  fieldsGrid.innerHTML = '';
  rawJson.textContent = '';
  rawWrap.classList.add('hidden');
  summary.classList.add('hidden');
  resultHint.textContent = 'Run extraction to see parsed fields.';
  setStatus('Idle', 'neutral');
});

copyBtn.addEventListener('click', async () => {
  if (!latestResult) return;

  try {
    await navigator.clipboard.writeText(JSON.stringify(latestResult, null, 2));
    copyBtn.textContent = 'Copied';
    setTimeout(() => {
      copyBtn.textContent = 'Copy JSON';
    }, 1000);
  } catch (error) {
    copyBtn.textContent = 'Copy failed';
    setTimeout(() => {
      copyBtn.textContent = 'Copy JSON';
    }, 1200);
  }
});

buildSampleButtons();
setStatus('Idle', 'neutral');
