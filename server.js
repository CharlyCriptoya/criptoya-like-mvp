import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Servimos el front (carpeta public)
app.use(express.static("public"));

// Endpoint proxy simple para evitar CORS en el cliente
// Ej: /api/price/BTC  o  /api/price/ETH
app.get("/api/price/:symbol", async (req, res) => {
  try {
    const sym = req.params.symbol.toLowerCase();
    // Ejemplo de endpoint (ajústalo si querés otra moneda/fiat)
    const url = `https://criptoya.com/api/${sym}/usd/1`;
    const r = await fetch(url, { timeout: 10000 });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "fetch_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
