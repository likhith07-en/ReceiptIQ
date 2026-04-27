require('dotenv').config();

const path = require('path');
const express = require('express');
const cors    = require('cors');
const { extractFields } = require('./extractor');

const app  = express();
const PORT = process.env.PORT || 3000;
const UI_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json());
app.use('/ui', express.static(UI_DIR));

// UI page
app.get('/ui', (req, res) => {
  res.sendFile(path.join(UI_DIR, 'index.html'));
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'structured-data-extractor' });
});

// POST /extract
app.post('/extract', async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({
      error: 'Request body must include a "text" string field.'
    });
  }

  try {
    const result = await extractFields(text);
    return res.json(result);
  } catch (err) {
    console.error('Extraction error:', err.message);
    return res.status(500).json({ error: 'Internal extraction error.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
