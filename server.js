// server.js
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

// Fallback por si el runtime no trae fetch global
if (typeof fetch === 'undefined') global.fetch = (await import('node-fetch')).default;

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

// ===== Static: sirve raíz y /public (por si querés mover imágenes) =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname));                      // index.html, muro.jpeg en raíz
app.use('/public', express.static(path.join(__dirname, 'public'))); // opcional

// ===== Healthcheck (Render) =====
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

// ========================= DÓLAR =========================
app.get('/api/dolar', async (_req, res) => {
  try {
    const tipos = ['oficial', 'blue', 'tarjeta', 'mep', 'ccl', 'cripto'];
    const out = [];
    for (const t of tipos) {
      const r = await fetch(`https://dolarapi.com/v1/dolares/${t}`, {
        headers: { 'User-Agent': 'charly-cripto-mvp' }
      });
      if (!r.ok) continue;
      const j = await r.json();
      out.push({
        nombre: j.nombre || j.casa || t,
        compra: Number(j.compra || j.compra_promedio || 0),
        venta:  Number(j.venta  || j.venta_promedio  || 0)
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(out);
  } catch (e) {
    console.error('api/dolar error', e);
    res.status(500).json({ error: 'dolar_failed' });
  }
});

// ========================= PRECIOS /USDT POR EXCHANGE =========================
const EX_TIMEOUT_MS = 5000;

async function fetchJson(url, timeout = EX_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'charly-cripto-mvp' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  } finally { clearTimeout(id); }
}

async function tickerBinance(symbol) {
  const j = await fetchJson(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}`);
  return { bid_usd: +j.bidPrice, ask_usd: +j.askPrice };
}
async function tickerOKX(symbol) {
  const inst = symbol.replace('USDT', '-USDT');
  const j = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${inst}`);
  const d = j.data?.[0] || {};
  return { bid_usd: +d.bidPx, ask_usd: +d.askPx };
}
async function tickerBybit(symbol) {
  const j = await fetchJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`);
  const d = j.result?.list?.[0] || {};
  return { bid_usd: +d.bid1Price, ask_usd: +d.ask1Price };
}
async function tickerKucoin(symbol) {
  const inst = symbol.replace('USDT', '-USDT');
  const j = await fetchJson(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${inst}`);
  const d = j.data || {};
  return { bid_usd: +d.bestBid, ask_usd: +d.bestAsk };
}
async function tickerBitget(symbol) {
  const j = await fetchJson(`https://api.bitget.com/api/spot/v1/market/ticker?symbol=${symbol}`);
  const d = j.data || {};
  return { bid_usd: +d.bestBid, ask_usd: +d.bestAsk };
}
async function tickerMexc(symbol) {
  const j = await fetchJson(`https://api.mexc.com/api/v3/ticker/bookTicker?symbol=${symbol}`);
  return { bid_usd: +j.bidPrice, ask_usd: +j.askPrice };
}

// Cache USD/ARS 1 min
let usdarsCache = { v: 0, t: 0 };
async function getUsdArsVal() {
  const now = Date.now();
  if (usdarsCache.v && now - usdarsCache.t < 60_000) return usdarsCache.v;
  const r = await fetch('https://dolarapi.com/v1/dolares/cripto', { headers: { 'User-Agent': 'charly-cripto-mvp' } });
  const d = await r.json();
  const val = Number(d.venta || d.promedio || d.compra || 0);
  usdarsCache = { v: val, t: now };
  return val;
}

app.get('/api/precios', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
    const usdars = await getUsdArsVal();

    const tasks = [
      ['Binance', tickerBinance(symbol)],
      ['OKX',     tickerOKX(symbol)],
      ['Bybit',   tickerBybit(symbol)],
      ['KuCoin',  tickerKucoin(symbol)],
      ['Bitget',  tickerBitget(symbol)],
      ['MEXC',    tickerMexc(symbol)]
    ];

    const results = await Promise.allSettled(tasks.map(t => t[1]));
    const rows = results.map((r, i) => {
      const exchange = tasks[i][0];
      if (r.status !== 'fulfilled' || !r.value?.bid_usd || !r.value?.ask_usd) {
        return { exchange, pair: symbol, error: true };
      }
      const { bid_usd, ask_usd } = r.value;
      return {
        exchange,
        pair: symbol,
        bid_usd,
        ask_usd,
        bid_ars: usdars ? bid_usd * usdars : null,
        ask_ars: usdars ? ask_usd * usdars : null
      };
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({ symbol, usdars, rows });
  } catch (e) {
    console.error('api/precios error', e);
    res.status(500).json({ error: 'precios_failed' });
  }
});

// ========================= VELAS (GRÁFICO) =========================
// Con cache 15s y fallbacks de host
const candleCache = new Map(); // key `${symbol}-${interval}` -> {t, rows}

async function fetchKlines(host, symbol, interval, limit) {
  const url = `${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'charly-cripto-mvp' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${host}`);
  return await r.json();
}

app.get('/api/candles', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
    const interval = req.query.interval || '1h';
    const limit = Math.min(Number(req.query.limit) || 500, 1000);
    const key = `${symbol}-${interval}`;

    const now = Date.now();
    const cached = candleCache.get(key);
    if (cached && now - cached.t < 15000) {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(cached.rows);
    }

    const hosts = [
      'https://api.binance.com',
      'https://api.binance.us',
      'https://data-api.binance.vision'
    ];

    let klines; let lastErr;
    for (const h of hosts) {
      try {
        klines = await fetchKlines(h, symbol, interval, limit);
        if (Array.isArray(klines) && klines.length) break;
      } catch (e) { lastErr = e; }
    }
    if (!klines) throw lastErr || new Error('no_klines');

    const out = klines.map(k => ({ t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5] }));
    candleCache.set(key, { t: now, rows: out });

    res.setHeader('Cache-Control', 'no-store');
    res.json(out);
  } catch (e) {
    console.error('api/candles error', e);
    res.status(500).json({ error: 'candles_failed' });
  }
});

// ===== 404 JSON para /api desconocidas =====
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// ===== Fallback raíz (por si acceden a "/") =====
app.get('/', (req, res) => {
  const rootIndex = path.join(__dirname, 'index.html');
  res.sendFile(rootIndex, err => {
    if (err) res.status(404).send('index.html not found');
  });
});

// ===== Start =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MVP en http://localhost:${PORT}`));
