import express from "express";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(compression());
app.use(express.json());

// sirve todo lo que tenés en /public (tu index, css, imágenes, etc.)
app.use(express.static(path.join(__dirname, "public"), { maxAge: 0 }));

// ---------- DÓLAR ----------
app.get("/api/dolar", async (_, res) => {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares", { cache: "no-store" });
    const data = await r.json();
    // Normalizo a { nombre, compra, venta }
    const rows = (data || []).map(x => ({
      nombre: x.nombre || x.casa || "",
      compra: Number(x.compra ?? x.buyer ?? 0),
      venta:  Number(x.venta  ?? x.seller ?? 0)
    }));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "dolarapi" });
  }
});

// ---------- VELAS BINANCE (para el gráfico) ----------
// Front llama: /api/candles?symbol=BTCUSDT&interval=1h&limit=500
app.get("/api/candles", async (req, res) => {
  try {
    const symbol   = (req.query.symbol || "BTCUSDT").toUpperCase();
    const interval = (req.query.interval || "1h");
    const limit    = Math.min(parseInt(req.query.limit || 500, 10), 1000);

    const url = new URL("https://api.binance.com/api/v3/klines");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(limit));

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return res.status(r.status).json({ error: "binance " + r.status });

    const klines = await r.json();
    // mapeo al formato que usa tu index: [{t,o,h,l,c}]
    const rows = klines.map(k => ({
      t: k[0],          // open time (ms)
      o: Number(k[1]),  // open
      h: Number(k[2]),  // high
      l: Number(k[3]),  // low
      c: Number(k[4])   // close
    }));

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "candles" });
  }
});

// ---------- (opcional) /api/precios simple en USDT ----------
// Si ya tenés tu propio /api/precios que te mostraba exchanges, dejalo.
// Esto es por si no lo tenías: trae precio en USDT de varios CEX.
app.get("/api/precios", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  try {
    // Referencia USDARS (venta cripto de dolarapi)
    const d = await (await fetch("https://dolarapi.com/v1/dolares/cripto")).json();
    const usdars = Number(d?.venta || 0);

    const fetchers = [
      // [nombre, url, pathParaLlegarAlPrecio]
      ["BINANCE", `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}`,   x => Number(x?.bidPrice)],
      ["OKX",     `https://www.okx.com/api/v5/market/ticker?instId=${symbol}`,           x => Number(x?.data?.[0]?.bidPx)],
      ["KUCOIN",  `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${symbol}`, x => Number(x?.data?.bestBid)],
      ["BYBIT",   `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`, x => Number(x?.result?.list?.[0]?.bid1Price)],
      ["MEXC",    `https://api.mexc.com/api/v3/ticker/bookTicker?symbol=${symbol}`,      x => Number(x?.bidPrice)],
      ["BITGET",  `https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}`,  x => Number(x?.data?.[0]?.buyOne)]
    ];

    const results = await Promise.all(fetchers.map(async ([name, url, pick]) => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error();
        const j = await r.json();
        const bid_usd = pick(j);
        if (!bid_usd) throw new Error();
        return {
          exchange: name,
          pair: symbol,
          bid_usd,
          bid_ars: usdars ? bid_usd * usdars : null
        };
      } catch {
        return { exchange: name, pair: symbol, error: true };
      }
    }));

    res.json({ usdars, rows: results });
  } catch (e) {
    res.status(500).json({ error: "precios" });
  }
});

// ---------- fallback para SPA ----------
// (si entrás a /about.html, etc.)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Render/Heroku usa PORT
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("MVP en http://localhost:" + PORT);
});
