import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Healthcheck para Render
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Servir carpeta /public (ahí va tu index.html)
app.use(express.static(path.join(__dirname, "public")));

// Proxy: Dólar (dolarapi.com)
app.get("/api/dolar", async (_req, res) => {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares");
    res.json(await r.json());
  } catch {
    res.status(502).json({ error: "dolarapi_failed" });
  }
});

// Proxy: CriptoYa (pares por exchange) ej: /api/criptoya/usdt/ars/1
app.get("/api/criptoya/:asset/:fiat/:window?", async (req, res) => {
  const { asset, fiat, window } = req.params;
  const url = `https://criptoya.com/api/${asset}/${fiat}/${window || 1}`;
  try {
    const r = await fetch(url);
    res.json(await r.json());
  } catch {
    res.status(502).json({ error: "criptoya_failed" });
  }
});

// Proxy: Binance ticker
app.get("/api/binance/ticker", async (req, res) => {
  try {
    const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
    const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
    res.json(await r.json());
  } catch {
    res.status(502).json({ error: "binance_failed" });
  }
});

// Proxy: Binance klines
app.get("/api/binance/klines", async (req, res) => {
  try {
    const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
    const interval = req.query.interval || "1h";
    const limit = Math.min(Number(req.query.limit || 300), 1000);
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const raw = await r.json();
    const kl = raw.map(k => ({ t: k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4] }));
    res.json(kl);
  } catch {
    res.status(502).json({ error: "klines_failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server on port ${PORT}`);
});
