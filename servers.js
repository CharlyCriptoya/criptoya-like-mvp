// servers.js
import express from "express";
import fetch from "node-fetch"; // seguimos usando fetch para compatibilidad en Render
import path from "path";
import { fileURLToPath } from "url";

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Servir index.html
app.use(express.static(__dirname));

// ====== ENDPOINTS ======

// Dólar (dolarapi.com)
app.get("/api/dolar", async (req, res) => {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares");
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error("Error dolarapi", e);
    res.status(500).json({ error: "No se pudo obtener dólar" });
  }
});

// CriptoYa (pares ARS)
app.get("/api/criptoya/:asset/:fiat/:tiempo", async (req, res) => {
  const { asset, fiat, tiempo } = req.params;
  try {
    const url = `https://criptoya.com/api/${asset}/${fiat}/${tiempo}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error("Error criptoya", e);
    res.status(500).json({ error: "No se pudo obtener par" });
  }
});

// Binance ticker 24h
app.get("/api/binance/ticker", async (req, res) => {
  const sym = req.query.symbol;
  try {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`);
    const data = await r.json();
    res.json({
      last: Number(data.lastPrice),
      high24h: Number(data.highPrice),
      low24h: Number(data.lowPrice),
      priceChangePercent: Number(data.priceChangePercent)
    });
  } catch (e) {
    console.error("Error binance ticker", e);
    res.status(500).json({ error: "No se pudo obtener ticker" });
  }
});

// Binance klines (gráfico)
app.get("/api/binance/klines", async (req, res) => {
  const { symbol, interval, limit } = req.query;
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url);
    const raw = await r.json();
    const data = raw.map(k => ({
      t: k[0],
      o: +k[1],
      h: +k[2],
      l: +k[3],
      c: +k[4],
      v: +k[5]
    }));
    res.json(data);
  } catch (e) {
    console.error("Error binance klines", e);
    res.status(500).json({ error: "No se pudo obtener klines" });
  }
});

// USDT tickers por exchange (ejemplo con algunos exchanges P2P)
app.get("/api/usdt-tickers", async (req, res) => {
  const symbols = (req.query.symbols || "").split(",");
  const out = {};
  try {
    for (const sym of symbols) {
      // Ejemplo: usar CriptoYa para comparar exchanges en ARS/USD
      const url = `https://criptoya.com/api/${sym.replace("USDT","").toLowerCase()}/ars/1`;
      try {
        const r = await fetch(url);
        const data = await r.json();
        out[sym] = {};
        for (const ex in data) {
          out[sym][ex] = {
            bid: data[ex]?.totalBid,
            ask: data[ex]?.totalAsk
          };
        }
      } catch (e) {
        console.error(`Error cargando ${sym}`, e);
      }
    }
    res.json(out);
  } catch (e) {
    console.error("Error usdt-tickers", e);
    res.status(500).json({ error: "No se pudo obtener usdt-tickers" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});
