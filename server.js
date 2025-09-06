// server.js
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

// ===== Static (sirve tu index.html y assets desde la raíz del proyecto) =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname)); // deja tu index.html acá como lo tenías

// ===== Healthcheck (Render) =====
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

// ========================= DÓLAR =========================
// Respuesta: [{ nombre, compra, venta }, ...]
app.get('/api/dolar', async (_req, res) => {
  try {
    const tipos = ['oficial', 'blue', 'tarjeta', 'mep', 'ccl', 'cripto'];
    const out = [];
    for (const t of tipos) {
      const r = await fetch(`https://dolarapi.com/v1/dolares/${t}`, {
        headers: { 'User-Agent': 'charly-cripto-mvp' },
      });
      if (!r.ok) continue;
      const j = await r.json();
      out.push({
        nombre: j.nombre || j.casa || t,
        compra: Number(j.compra || j.compra_promedio || 0),
        venta: Number(j.venta || j.venta_promedio || 0),
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(out);
  } catch (e) {
    console.error('api/dolar error', e);
    res.status(500).json({ error: 'dolar_failed' });
  }
});

// Valor único USD→ARS (usa "cripto", cambiable a "blue" si querés)
app.get('/api/usdars', async (_req, res) => {
  try {
    const r = await fetch('https://dolarapi.com/v1/dolares/cripto');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const usdars = Number(d.venta || d.promedio || d.compra || 0);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ usdars });
  } catch (e) {
    console.error('api/usdars error', e);
    res.status(500).json({ error: 'usdars_failed' });
  }
});

// ========================= PRECIOS /USDT =========================
// /api/precios?symbol=BTCUSDT -> { symbol, usdars, rows:[{exchange,pair,bid_usd,ask_usd,bid_ars,ask_ars}] }
const EX_TIMEOUT_MS = 5000;

async function fetchJson(url, timeout = EX_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'charly-cripto-mvp' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(id);
  }
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

// Cache simple para USDARS (1 min)
let usdarsCache = { v: 0, t: 0 };
async function getUsdArsVal() {
  const now = Date.now();
  if (usdarsCache.v && now - usdarsCache.t < 60_000) return usdarsCache.v;
  const r = await fetch('https://dolarapi.com/v1/dolares/cripto');
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
      ['OKX', tickerOKX(symbol)],
      ['Bybit', tickerBybit(symbol)],
      ['KuCoin', tickerKucoin(symbol)],
      ['Bitget', tickerBitget(symbol)],
      ['MEXC', tickerMexc(symbol)],
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
        ask_ars: usdars ? ask_usd * usdars : null,
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
// /api/candles?symbol=BTCUSDT&interval=1h&limit=500
app.get('/api/candles', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
    const interval = req.query.interval || '1h';
    const limit = Math.min(Number(req.query.limit) || 500, 1000);
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

    const r = await fetch(url, { headers: { 'User-Agent': 'charly-cripto-mvp' } });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const klines = await r.json();

    const out = klines.map(k => ({
      t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5],
    }));
    res.setHeader('Cache-Control', 'no-store');
    res.json(out);
  } catch (e) {
    console.error('api/candles error', e);
    res.status(500).json({ error: 'candles_failed' });
  }
});

// ===== 404 JSON para rutas /api desconocidas =====
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// ===== Start =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Charly Cripto MVP escuchando en http://localhost:${PORT}`);
});
