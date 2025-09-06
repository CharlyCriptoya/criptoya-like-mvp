// servers.js — Charly Cripto • MVP
// Node 18+ (Render recomienda 18/20). Usa fetch nativo.

// ====== Imports y setup ======
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Opcionales (si los instalás): compresión y CORS ligero
// import compression from "compression";
// import cors from "cors";

const app = express();
app.use(express.json({ limit: "1mb" }));
// app.use(compression());
// app.use(cors());

// Utilidades de ruta
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pequeña ayuda para upstreams
async function proxyJson(res, url, opts = {}) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "charly-cripto-mvp" },
      ...opts,
    });
    if (!r.ok) {
      return res.status(r.status).json({ error: `upstream_${r.status}` });
    }
    const data = await r.json();
    // Evitá cache viejo en Render free
    res.set("Cache-Control", "no-store");
    return res.json(data);
  } catch (e) {
    console.error("Proxy error:", e?.message || e);
    return res.status(500).json({ error: "proxy_error" });
  }
}

// ====== Endpoints públicos que usa el front ======

// 1) Dólar — el front espera un ARRAY
app.get("/api/dolar", async (req, res) => {
  // https://dolarapi.com/v1/dolares → array
  return proxyJson(res, "https://dolarapi.com/v1/dolares");
});

// 2) CriptoYa — formato: /api/criptoya/:asset/:fiat/1
// Ej: /api/criptoya/usdt/ars/1
app.get("/api/criptoya/:asset/:fiat/1", async (req, res) => {
  const { asset, fiat } = req.params;
  const url = `https://criptoya.com/api/${encodeURIComponent(asset)}/${encodeURIComponent(fiat)}/1`;
  return proxyJson(res, url);
});

// 3) Binance klines — velas para el gráfico
// Ej: /api/binance/klines?symbol=BTCUSDT&interval=1h&limit=500
app.get("/api/binance/klines", async (req, res) => {
  const { symbol = "BTCUSDT", interval = "1h", limit = "500" } = req.query;
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(
    symbol
  )}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(
    limit
  )}`;
  return proxyJson(res, url);
});

// 4) Binance ticker 24h — stats rápidas
// Ej: /api/binance/ticker?symbol=BTCUSDT
app.get("/api/binance/ticker", async (req, res) => {
  const { symbol = "BTCUSDT" } = req.query;
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(
    symbol
  )}`;
  return proxyJson(res, url);
});

// 5) IA opcional (GPT). Si no configurás clave, devolvemos 501 y el front usa análisis local.
// Para activarlo más adelante:
// - instalá openai (SDK nuevo) o usá fetch a /v1/responses
// - seteá OPENAI_API_KEY en Render
app.post("/api/ai/analyze", async (req, res) => {
  // Por ahora sin GPT:
  return res.status(501).json({ error: "ai_not_configured" });

  /* === Para habilitar GPT más adelante (borrá el return de arriba y descomentá):
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(501).json({ error: "missing_openai_key" });
    }
    const { symbol, interval, candles, riskPct, sidePref } = req.body || {};
    // Armamos el prompt con los datos crudos (NO envíes datos personales)
    const prompt = JSON.stringify({ symbol, interval, riskPct, sidePref, candles });

    // Ejemplo con fetch al Responses API (modelo "gpt-4.1-mini" o similar):
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: "Sos un analista técnico profesional. Redactá claro, conciso y accionable." },
          { role: "user", content: `Generá un informe de análisis técnico completo a partir de estos datos JSON: ${prompt}` }
        ]
      })
    });
    if (!r.ok) {
      const err = await r.text();
      console.error("OpenAI error:", err);
      return res.status(502).json({ error: "openai_bad_gateway" });
    }
    const data = await r.json();
    const text =
      data?.output_text ||
      data?.output?.[0]?.content?.[0]?.text ||
      data?.choices?.[0]?.message?.content ||
      "No se pudo generar el informe.";
    return res.json({ text });
  } catch (e) {
    console.error("AI endpoint error:", e?.message || e);
    return res.status(500).json({ error: "ai_endpoint_error" });
  }
  */
});

// ====== Estático & health ======

// Serví /public si existe, y / index.html en raíz como fallback
app.use(express.static(path.join(__dirname, "public")));

app.get("/.well-known/health", (req, res) => {
  res.type("text/plain").send("ok");
});

// Si no encontró estáticos, serví el index de la raíz (útil en Render)
app.get("*", (req, res) => {
  const rootIndex = path.join(__dirname, "index.html");
  res.sendFile(rootIndex, (err) => {
    if (err) res.status(404).send("Not found");
  });
});

// ====== Arranque ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Charly Cripto • server escuchando en :${PORT}`);
});
