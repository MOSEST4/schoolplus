const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json());

// ── Config ─────────────────────────────────────────────────────────────────
const MARZPAY_BASE  = 'https://wallet.wearemarz.com/api/v1';
const MARZPAY_AUTH  = 'bWFyel9TTmdZMHRwb1FVcFk1WmNoOndIRWdTT0lhUjhCUjNMMDV2NlZFUHFzMTBOZFdNZzU4';
const PROXY_KEY     = 'schoolplus_2025_proxy_key';

// ── CORS ───────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin',  '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Proxy-Key, Cache-Control, Authorization');
  res.header('Cache-Control', 'no-store, no-cache');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Auth middleware ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const open = ['/', '/health'];
  if (open.includes(req.path)) return next();
  if (req.headers['x-proxy-key'] !== PROXY_KEY) {
    return res.status(403).json({ status: 'error', message: 'Unauthorized' });
  }
  next();
});

// ── Shared MarzPay headers ─────────────────────────────────────────────────
const marzHeaders = {
  'Authorization': `Basic ${MARZPAY_AUTH}`,
  'Content-Type':  'application/json',
  'Accept':        'application/json',
  'Cache-Control': 'no-cache',
};

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/', (_, res) => res.json({
  status:  'ok',
  service: 'SchoolPlus Proxy v1.0.0',
  routes:  ['/health', '/collect', '/status/:uuid', '/ai/chat'],
}));

app.get('/health', async (_, res) => {
  try {
    const r = await axios.get('https://api.ipify.org?format=json');
    res.json({ status: 'ok', service: 'SchoolPlus Proxy v1.0.0', ip: r.data.ip });
  } catch {
    res.json({ status: 'ok', service: 'SchoolPlus Proxy v1.0.0' });
  }
});

// ── MarzPay: Collect (STK push) ────────────────────────────────────────────
// POST /collect  { phone_number, amount, narrative, reference, country }
app.post('/collect', async (req, res) => {
  try {
    console.log('[COLLECT] ->', JSON.stringify(req.body));
    const r = await axios.post(
      `${MARZPAY_BASE}/collect-money`,
      req.body,
      { headers: marzHeaders }
    );
    console.log('[COLLECT] <-', JSON.stringify(r.data));
    res.json(r.data);
  } catch (e) {
    console.error('[COLLECT] ERROR', e.message, e.response?.data);
    res.json(e.response?.data ?? { status: 'error', message: e.message });
  }
});

// ── MarzPay: Status check ──────────────────────────────────────────────────
// GET /status/:uuid
app.get('/status/:uuid', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const url = `${MARZPAY_BASE}/collect-money/${req.params.uuid}?_t=${Date.now()}`;
    const r   = await axios.get(url, {
      headers: { ...marzHeaders, 'Cache-Control': 'no-cache, no-store' },
    });
    console.log('[STATUS]', req.params.uuid, '->', r.data?.status);
    res.json(r.data);
  } catch (e) {
    console.error('[STATUS] ERROR', e.message, e.response?.data);
    res.json(e.response?.data ?? { status: 'error', message: e.message });
  }
});

// ── Groq AI: Chat completion ───────────────────────────────────────────────
// POST /ai/chat  { messages: [{role, content}], model?, temperature? }
app.post('/ai/chat', async (req, res) => {
  try {
    const { messages, model = 'llama-3.3-70b-versatile', temperature = 0.7 } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ status: 'error', message: 'messages array required' });
    }
    const r = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model, temperature, messages },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type':  'application/json',
        },
        timeout: 30000,
      }
    );
    const text = r.data?.choices?.[0]?.message?.content ?? '';
    res.json({ status: 'ok', content: text });
  } catch (e) {
    console.error('[AI]', e.message, e.response?.data);
    res.status(500).json({ status: 'error', message: e.response?.data?.error?.message ?? e.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SchoolPlus Proxy v1.0.0 running on port ${PORT}`));
