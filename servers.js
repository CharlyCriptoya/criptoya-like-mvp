// servers.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Static (poné tu index en ./public)
app.use(express.static(path.join(__dirname, "public")));

function cache(res, secs) {
  res.set("Cache-Control", `public, max-age=${secs}`);
}

// ---- DÓLAR (igual que antes)
app.get("/api/dolar", async (_, res) => {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares", { timeout: 15000 });
    const j = await r.json();
    cache(res, 30);
    res.json(j);
  } catch {
    res.status(500).json({ error: "dolarapi_failed" });
  }
});

// ---- CRIPTOYA (igual que antes: para USDT/ARS)
app.get("/api/criptoya/:asset/:fiat/:page?", async (req, res) => {
  const { asset, fiat } = req.params;
  try {
    const url = `https://criptoya.com/api/${asset}/${fiat}/1`;
    const r = await fetch(url, { timeout: 15000 });
    const j = await r.json();
    cache(res, 20);
    res.json(j);
  } catch {
    res.status(500).json({ error: "criptoya_failed" });
  }
});

// ---- BINANCE proxy (gráfico sin CORS ni API key)
app.get("/api/binance/klines", async (req, res) => {
  const { symbol = "BTCUSDT", interval = "1h", limit = "500" } = req.query;
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url, { timeout: 15000 });
    const j = await r.json();
    cache(res, 10);
    res.json(j);
  } catch {
    res.status(500).json({ error: "binance_klines_failed" });
  }
});

app.get("/api/binance/ticker", async (req, res) => {
  const { symbol = "BTCUSDT" } = req.query;
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
    const r = await fetch(url, { timeout: 15000 });
    const j = await r.json();
    cache(res, 10);
    res.json({
      last: Number(j.lastPrice),
      high24h: Number(j.highPrice),
      low24h: Number(j.lowPrice),
      priceChangePercent: Number(j.priceChangePercent),
    });
  } catch {
    res.status(500).json({ error: "binance_ticker_failed" });
  }
});

// ---- NUEVO: /api/usdt-tickers  (pares /USDT por exchange, sin API key)
const EXCHANGES = {
  binance: async (sym) => {
    const u = `https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`;
    const r = await fetch(u, { timeout: 12000 });
    const j = await r.json();
    return { bid: Number(j.bidPrice), ask: Number(j.askPrice) };
  },
  bybit: async (sym) => {
    const u = `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${sym}`;
    const r = await fetch(u, { timeout: 12000 });
    const j = await r.json();
    const t = j?.result?.list?.[0] || {};
    return { bid: Number(t.bid1Price), ask: Number(t.ask1Price) };
  },
  okx: async (sym) => {
    // OKX usa formato BTC-USDT
    const s = sym.replace("USDT", "-USDT");
    const u = `https://www.okx.com/api/v5/market/ticker?instId=${s}`;
    const r = await fetch(u, { timeout: 12000 });
    const j = await r.json();
    const t = j?.data?.[0] || {};
    return { bid: Number(t.bidPx), ask: Number(t.askPx) };
  },
  kucoin: async (sym) => {
    const u = `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${sym}`;
    const r = await fetch(u, { timeout: 12000 });
    const j = await r.json();
    const t = j?.data || {};
    return { bid: Number(t.bestBid), ask: Number(t.bestAsk) };
  },
  bitget: async (sym) => {
    const u = `https://api.bitget.com/api/spot/v1/market/tickers?symbol=${sym}`;
    const r = await fetch(u, { timeout: 12000 });
    const j = await r.json();
    const t = j?.data?.[0] || {};
    return { bid: Number(t.bestBid), ask: Number(t.bestAsk) };
  },
};

app.get("/api/usdt-tickers", async (req, res) => {
  // symbols=BTCUSDT,ETHUSDT,SOLUSDT
  const symbols = String(req.query.symbols || "BTCUSDT,ETHUSDT,SOLUSDT")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const out = {};
  try {
    for (const sym of symbols) {
      out[sym] = {};
      await Promise.all(
        Object.keys(EXCHANGES).map(async (ex) => {
          try {
            const q = await EXCHANGES[ex](sym);
            out[sym][ex] = q;
          } catch {
            out[sym][ex] = null;
          }
        })
      );
    }
    cache(res, 10);
    res.json(out);
  } catch {
    res.status(500).json({ error: "usdt_tickers_failed" });
  }
});

// Front SPA
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("servers.js on " + PORT));
