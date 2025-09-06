// server.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

// ——— Setup paths/app ———
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Estáticos de /public
app.use(express.static(path.join(__dirname, "public")));

// No cachear en todas las APIs
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, max-age=0");
  next();
});

// ——— Helpers ———
const ok = (res, data) => res.json(data);
const err = (res, code, e) => res.status(500).json({ error: code, details: String(e) });

const toSymbol = (pair = "BTCUSDT") =>
  pair.includes("/") ? pair.replace("/", "").toUpperCase() : pair.toUpperCase();

const toOkx = (pair = "BTC-USDT") =>
  pair.includes("/") ? pair.replace("/", "-").toUpperCase()
                     : (pair.slice(0, 3) + "-" + pair.slice(3)).toUpperCase();

// ——— Adapters: Binance / OKX / Bybit ———
const adapters = {
  binance: {
    async ticker(symbol) {
      const sym = toSymbol(symbol);
      const r = await fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${sym}`);
      if (!r.ok) throw new Error("binance.ticker " + r.status);
      const j = await r.json();
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
      return a.map(k => ({
        time: +k[0],
        open: +k[1],
        high: +k[2],
        low: +k[3],
        close: +k[4],
        volume: +k[5],
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
      return a.reverse().map(k => ({
        time: +k[0],
        open: +k[1],
        high: +k[2],
        low: +k[3],
        close: +k[4],
        volume: +k[5],
      }));
    },
  },

  bybit: {
    async ticker(symbol) {
      const sym = toSymbol(symbol);
      const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${sym}`);
      if (!r.ok) throw new Error("bybit.ticker " + r.status);
      const j = await r.json();
      const it = j?.result?.list?.[0];
      if (!it) throw new Error("bybit.ticker empty");
      return { last:
