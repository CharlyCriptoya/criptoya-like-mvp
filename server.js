// server.js
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

// Salud
app.get("/health", (_, res) => res.json({ ok: true }));

/**
 * /api/crypto
 * Precios en USD y ARS de BTC, ETH, USDT usando CoinGecko (sin API key).
 * Ej: /api/crypto?assets=bitcoin,ethereum,tether
 */
app.get("/api/crypto", async (req, res) => {
  try {
    const assets = (req.query.assets || "bitcoin,ethereum,tether")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${assets}&vs_currencies=usd,ars`;
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const data = await r.json();
    res.json({ updatedAt: new Date().toISOString(), data });
  } catch (err) {
    res.status(500).json({ error: "crypto_fetch_failed", details: String(err) });
  }
});

/**
 * /api/dolares
 * Cotizaciones AR: oficial / blue / mep / ccl usando dolarapi.com
 * Devolvemos { tipo: {compra, venta} }
 */
app.get("/api/dolares", async (_req, res) => {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares", { headers:{accept:"application/json"} });
    if (!r.ok) throw new Error(`dolarapi ${r.status}`);
    const arr = await r.json(); // array de tipos
    const pick = (code) => {
      const x = arr.find(d => (d?.casa || d?.nombre || d?.moneda || "").toString().toLowerCase().includes(code));
      // Algunos devuelven {compra, venta}; si no, normalizamos
      return x ? { compra: Number(x.compra ?? x.buy ?? x?.valor ?? 0), venta: Number(x.venta ?? x.sell ?? x?.valor ?? 0) } : null;
    };
    // Mapeos comunes: "oficial", "blue", "mep", "ccl"
    const out = {
      oficial: pick("oficial"),
      blue:   pick("blue"),
      mep:    pick("mep"),
      ccl:    pick("contado con liqui") || pick("ccl") || pick("liqui"),
      // fallback: si alguno no existe
    };
    res.json({ updatedAt: new Date().toISOString(), ...out });
  } catch (err) {
    // fallback suave si la API no responde (para que no rompa todo)
    res.json({
      updatedAt: new Date().toISOString(),
      oficial: { compra: 0, venta: 0 },
      blue:    { compra: 0, venta: 0 },
      mep:     { compra: 0, venta: 0 },
      ccl:     { compra: 0, venta: 0 }
    });
  }
});

// SPA fallback
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
