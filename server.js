// server.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

// ——— Setup de paths y app ———
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
// Servir /public
app.use(express.static(path.join(__dirname, "public")));

// ——— Helpers ———
const ok = (res, data) => res.json(data);
const err = (res, code, e) => res.status(500).json({ error: code, details: String(e) });

const toSymbol = (pair) =>
  (pair || "BTCUSDT").includes("/")
    ? pair.replace("/", "").toUpperCase()
    : (pair || "BTCUSDT").toUpperCase();

const toOkx = (pair) => {
  if (!pair) return "BTC-USDT";
  return pair.includes("/") ? pair.replace("/", "-").toUpperCase()
                            : (pair.slice(0, 3) + "-" + pair.slice(3)).toUpperCase();
};

// Adapters simples para 3 exchanges (endpoints públicos)
const adapters = {
  binance: {
    async ticker(symbol) {
      const sym = toSymbol(symbol);
      const r = await fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${sym}`);
      if (!r.ok) throw new Error("binance.ticker " + r.status);
      const j = await r.json();
      // usamos ask como "last" aproximado
      return { last: +j.askPrice, bid: +j.bidPrice, ask: +j.askPrice };
    },
    async ticker24h(symbol) {
      const sym = toSymbol(symbol);
      const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`);
      if (!r.ok) throw new Error("binance.24h " + r.status);
      const j = await r.json();
      return {
        high24h: +j.highPrice,
        low24h: +j.lowPrice,
        volume24h: +j.volume,
        open: +j.openPrice,
        priceChangePercent: +j.priceChangePercent,
      };
    },
    async klines(symbol, interval = "1m", limit = 300) {
      const sym = toSymbol(symbol);
      const r = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
      );
      if (!r.ok) throw new Error("binance.klines " + r.status);
      const a = await r.json();
      return a.map((k) => ({
        time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
      }));
    },
  },

  okx: {
    async ticker(symbol) {
      const instId = toOkx(symbol);
      const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
      if (!r.ok) throw new Error("okx.ticker " + r.status);
      const j = await r.json();
      const d = j?.data?.[0] || {};
      return { last: +d.last, bid: +d.bidPx, ask: +d.askPx };
    },
    async ticker24h(symbol) {
      const instId = toOkx(symbol);
      const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
      if (!r.ok) throw new Error("okx.24h " + r.status);
      const j = await r.json();
      const d = j?.data?.[0] || {};
      return { high24h: +d.high24h, low24h: +d.low24h, volume24h: +d.vol24h };
    },
    async klines(symbol, interval = "1m", limit = 300) {
      const map = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D" };
      const instId = toOkx(symbol);
      const bar = map[interval] || "1m";
      const r = await fetch(
        `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`
      );
      if (!r.ok) throw new Error("okx.klines " + r.status);
      const j = await r.json();
      const a = j?.data || [];
      return a.reverse().map((k) => ({
        time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
      }));
    },
  },

  bybit: {
    async ticker(symbol) {
      const sym = toSymbol(symbol);
      const r = await fetch(
        `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${sym}`
      );
      if (!r.ok) throw new Error("bybit.ticker " + r.status);
      const j = await r.json();
      const it = j?.result?.list?.[0];
      if (!it) throw new Error("bybit.ticker empty");
      return { last: +it.lastPrice, bid: +it.bid1Price, ask: +it.ask1Price };
    },
    async ticker24h(symbol) {
      const sym = toSymbol(symbol);
      const r = await fetch(
        `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${sym}`
      );
      if (!r.ok) throw new Error("bybit.24h " + r.status);
      const j = await r.json();
      const it = j?.result?.list?.[0];
      if (!it) throw new Error("bybit.24h empty");
      return {
        high24h: +(it.highPrice24h || it.highPrice),
        low24h: +(it.lowPrice24h || it.lowPrice),
        volume24h: +(it.turnover24h || 0),
      };
    },
    async klines(symbol, interval = "1m", limit = 300) {
      const map = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D" };
      const sym = toSymbol(symbol);
      const iv = map[interval] || "1";
      const r = await fetch(
        `https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=${iv}&limit=${limit}`
      );
      if (!r.ok) throw new Error("bybit.klines " + r.status);
      const j = await r.json();
      const a = j?.result?.list || [];
      return a.reverse().map((k) => ({
        time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
      }));
    },
  },
};

// ——— Endpoints básicos que ya tenías ———

// Salud
app.get("/health", (_req, res) => ok(res, { ok: true }));

/**
 * /api/crypto
 * Precios en USD y ARS de BTC, ETH, USDT usando CoinGecko (sin API key).
 * Ej: /api/crypto?assets=bitcoin,ethereum,tether
 */
app.get("/api/crypto", async (req, res) => {
  try {
    const assets = (req.query.assets || "bitcoin,ethereum,tether")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${assets}&vs_currencies=usd,ars`;
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const data = await r.json();
    ok(res, { updatedAt: new Date().toISOString(), data });
  } catch (e) {
    err(res, "crypto_fetch_failed", e);
  }
});

/**
 * /api/dolares
 * Cotizaciones AR: oficial / blue / mep / ccl usando dolarapi.com
 * Devolvemos { tipo: {compra, venta} }
 */
app.get("/api/dolares", async (_req, res) => {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares", {
      headers: { accept: "application/json" },
    });
    if (!r.ok) throw new Error(`dolarapi ${r.status}`);
    const arr = await r.json();
    const pick = (code) => {
      const x = arr.find((d) =>
        (d?.casa || d?.nombre || d?.moneda || "").toString().toLowerCase().includes(code)
      );
      return x
        ? {
            compra: Number(x.compra ?? x.buy ?? x?.valor ?? 0),
            venta: Number(x.venta ?? x.sell ?? x?.valor ?? 0),
          }
        : null;
    };
    const out = {
      oficial: pick("oficial"),
      blue: pick("blue"),
      mep: pick("mep"),
      ccl: pick("contado con liqui") || pick("ccl") || pick("liqui"),
    };
    ok(res, { updatedAt: new Date().toISOString(), ...out });
  } catch (_e) {
    ok(res, {
      updatedAt: new Date().toISOString(),
      oficial: { compra: 0, venta: 0 },
      blue: { compra: 0, venta: 0 },
      mep: { compra: 0, venta: 0 },
      ccl: { compra: 0, venta: 0 },
    });
  }
});

// ——— Endpoints para el gráfico/IA ———

// Lista simple de exchanges disponibles
app.get("/api/exchanges", (_req, res) =>
  ok(res, [
    { id: "binance", name: "Binance" },
    { id: "okx", name: "OKX" },
    { id: "bybit", name: "Bybit" },
  ])
);

// Ticker (bid/ask/last aprox.)
app.get("/api/ticker", async (req, res) => {
  try {
    const { exchange = "binance", symbol = "BTCUSDT" } = req.query;
    const ad = adapters[exchange];
    if (!ad) return res.status(400).json({ error: "unknown_exchange" });
    const data = await ad.ticker(symbol);
    ok(res, { exchange, symbol, ...data });
  } catch (e) {
    err(res, "ticker_failed", e);
  }
});

// 24h stats (high/low/volume)
app.get("/api/ticker24h", async (req, res) => {
  try {
    const { exchange = "binance", symbol = "BTCUSDT" } = req.query;
    const ad = adapters[exchange];
