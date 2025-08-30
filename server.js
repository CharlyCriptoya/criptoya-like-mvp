import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Servir estáticos desde /public
app.use(express.static(path.join(__dirname, "public")));

// Endpoint simple de salud
app.get("/health", (_, res) => res.json({ ok: true }));

// API: precios BTC y ETH desde CoinGecko (sin API key)
app.get("/api/prices", async (req, res) => {
  try {
    const ids = ["bitcoin", "ethereum"].join(",");
    const vs = "usd";
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs}`;
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const data = await r.json();
    res.json({
      updatedAt: new Date().toISOString(),
      prices: {
        BTC: data.bitcoin?.usd ?? null,
        ETH: data.ethereum?.usd ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "price_fetch_failed", details: String(err) });
  }
});

// (opcional) 404 a index.html
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
