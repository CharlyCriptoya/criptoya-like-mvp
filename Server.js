import express from "express";
import compression from "compression";

const app = express();
app.use(compression());
app.use(express.static("public", { maxAge: "1h", index: "index.html" }));

// Utilidad fetch con timeout
async function getJSON(url, { headers = {}, timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const r = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", ...headers },
    signal: ctrl.signal,
  }).catch((e) => ({ ok: false, status: 599, text: async () => e.message }));
  clearTimeout(t);
  if (!r?.ok) {
    const msg = r?.status ? `HTTP ${r.status}` : "fetch error";
    throw new Error(`${url} -> ${msg}`);
  }
  return r.json();
}

// ---------- DÓLAR ----------
app.get("/api/dolar", async (_req, res) => {
  try {
    const arr = await getJSON("https://dolarapi.com/v1/dolares");
    // normalizo nombres comunes
    const mapName = (n) =>
      ({
        "oficial": "OFICIAL",
        "blue": "BLUE",
        "bolsa": "BOLSA",
        "contadoconliqui": "CONTADO CON LIQUIDACIÓN",
        "cripto": "CRIPTO",
        "tarjeta": "TARJETA",
        "mayorista": "MAYORISTA",
        "ccl": "CCL",
        "mep": "MEP"
      }[n?.toLowerCase()] || (n || "").toUpperCase());

    const rows = arr.map((x) => ({
      nombre: mapName(x.casa || x.nombre),
      compra: x.compra ?? x.buy ?? null,
      venta: x.venta ?? x.sell ?? null,
    }));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "dolar", message: e.message });
  }
});

// USD/ARS de referencia (tomo DÓLAR CRIPTO venta; si falla, BLUE)
async function usdArsRef() {
  try {
    const arr = await getJSON("https://dolarapi.com/v1/dolares");
    const cripto = arr.find((x) => (x.nombre || x.casa || "").toLowerCase().includes("cripto"));
    const blue = arr.find((x) => (x.nombre || x.casa || "").toLowerCase().includes("blue"));
    return Number(cripto?.venta || blue?.venta || 0);
  } catch {
    return 0;
  }
}

// ---------- PARES ARS de CriptoYa ----------
app.get("/api/ars", async (req, res) => {
  const asset = (req.query.asset || "BTC").toLowerCase();
  const urls = [
    `https://criptoya.com/api/${asset}/ars`,
    `https://criptoya.com/api/${asset}/ars/1`
  ];
  try {
    let data;
    for (const u of urls) {
      try { data = await getJSON(u); break; } catch {}
    }
    if (!data) throw new Error("sin datos");

    // data suele ser objeto {EXCHANGE: {totalAsk,totalBid,ask,bid,...}, ...}
    const rows = Object.entries(data)
      .map(([ex, v]) => ({
        exchange: ex.toUpperCase(),
        pair: `${asset.toUpperCase()}/ARS`,
        buy_ars: Number(v?.totalAsk ?? v?.ask ?? v?.askTotal ?? v?.total_ask ?? v?.compra ?? 0) || null,
        sell_ars: Number(v?.totalBid ?? v?.bid ?? v?.bidTotal ?? v?.total_bid ?? v?.venta ?? 0) || null
      }))
      .filter(r => r.buy_ars || r.sell_ars);

    // ordeno por mejor venta (menor) si hay
    rows.sort((a, b) => (a.sell_ars ?? 9e15) - (b.sell_ars ?? 9e15));
    res.json({ asset: asset.toUpperCase(), rows });
  } catch (e) {
    res.status(500).json({ error: "criptoya", message: e.message, rows: [] });
  }
});

// ---------- PARES /USDT (exchanges globales) ----------
const exch = {
  BINANCE: async (sym) => {
    // varios mirrors para evitar 451
    const bases = [
      "https://api1.binance.com",
      "https://api2.binance.com",
      "https://api3.binance.com",
      "https://data-api.binance.vision"
    ];
    let j;
    for (const b of bases) {
      try {
        j = await getJSON(`${b}/api/v3/ticker/bookTicker?symbol=${sym}`);
        if (j?.bidPrice) break;
      } catch {}
    }
    return { bid: Number(j?.bidPrice || 0) || null };
  },
  BYBIT: async (sym) => {
    const j = await getJSON(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${sym}`);
    const it = j?.result?.list?.[0];
    return { bid: Number(it?.bid1Price || it?.lastPrice || 0) || null };
  },
  OKX: async (sym) => {
    const inst = sym.replace("USDT", "-USDT");
    const j = await getJSON(`https://www.okx.com/api/v5/market/ticker?instId=${inst}`);
    const it = j?.data?.[0];
    return { bid: Number(it?.bidPx || 0) || null };
  },
  KUCOIN: async (sym) => {
    const inst = sym.replace("USDT", "-USDT");
    const j = await getJSON(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${inst}`);
    return { bid: Number(j?.data?.bestBid || j?.data?.price || 0) || null };
  },
  MEXC: async (sym) => {
    const j = await getJSON(`https://api.mexc.com/api/v3/ticker/bookTicker?symbol=${sym}`);
    return { bid: Number(j?.bidPrice || 0) || null };
  },
  BITGET: async (sym) => {
    // Bitget: a veces requiere sufijo _SPBL para spot
    const tryUrls = [
      `https://api.bitget.com/api/spot/v1/market/ticker?symbol=${sym}`,
      `https://api.bitget.com/api/spot/v1/market/ticker?symbol=${sym}_SPBL`
    ];
    let j;
    for (const u of tryUrls) {
      try { j = await getJSON(u); if (j?.data?.[0]?.sellPr) break; } catch {}
    }
    const it = j?.data?.[0];
    // usan sellPr/buyPr; me quedo con buy (mejor precio de compra del libro)
    return { bid: Number(it?.buyPr || it?.lastPr || 0) || null };
  }
};

app.get("/api/precios", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  const usdars = await usdArsRef();
  const exchanges = Object.keys(exch); // todos
  const rows = await Promise.all(
    exchanges.map(async (name) => {
      try {
        const { bid } = await exch[name](symbol);
        if (!bid) throw new Error("sin bid");
        return {
          exchange: name,
          pair: symbol,
          bid_usd: bid,
          bid_ars: usdars ? bid * usdars : null
        };
      } catch (e) {
        return { exchange: name, pair: symbol, error: e.message };
      }
    })
  );
  const okRows = rows.filter(r => !r.error).sort((a, b) => (b.bid_ars ?? 0) - (a.bid_ars ?? 0));
  res.json({ rows: okRows, failed: rows.filter(r => r.error).map(r => r.exchange), usdars });
});

// ---------- VELAS BINANCE (con mirrors para evitar 451) ----------
app.get("/api/candles", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  const interval = req.query.interval || "1h";
  const limit = Math.max(50, Math.min(1000, Number(req.query.limit) || 500));

  const bases = [
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://data-api.binance.vision"
  ];
  try {
    let rows;
    for (const b of bases) {
      try {
        rows = await getJSON(`${b}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
        if (Array.isArray(rows)) break;
      } catch {}
    }
    if (!rows) throw new Error("sin datos");

    const out = rows.map((c) => ({
      t: Number(c[0]), // open time
      o: c[1], h: c[2], l: c[3], c: c[4], v: c[5]
    }));
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "candles", message: e.message });
  }
});

// ---------- Análisis técnico simple (local) ----------
app.get("/api/ta", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  const interval = req.query.interval || "1h";
  try {
    const candles = await (await fetch(`${req.protocol}://${req.get("host")}/api/candles?symbol=${symbol}&interval=${interval}&limit=300`)).json();
    if (!Array.isArray(candles) || !candles.length) throw new Error("sin velas");

    const closes = candles.map(x => Number(x.c));
    const ema = (period, arr) => {
      const k = 2 / (period + 1);
      let e = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const out = [e];
      for (let i = period; i < arr.length; i++) {
        e = arr[i] * k + e * (1 - k);
        out.push(e);
      }
      return out;
    };
    const sma = (period, arr) => arr.map((_, i) => i + 1 >= period
      ? arr.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period
      : null);

    // RSI(14)
    const rsi = (period, arr) => {
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
        const ch = arr[i] - arr[i - 1];
        gains += ch > 0 ? ch : 0; losses += ch < 0 ? -ch : 0;
      }
      let avgG = gains / period, avgL = losses / period;
      const out = [100 - 100 / (1 + (avgG / (avgL || 1e-9)))];
      for (let i = period + 1; i < arr.length; i++) {
        const ch = arr[i] - arr[i - 1];
        avgG = (avgG * (period - 1) + (ch > 0 ? ch : 0)) / period;
        avgL = (avgL * (period - 1) + (ch < 0 ? -ch : 0)) / period;
        out.push(100 - 100 / (1 + (avgG / (avgL || 1e-9))));
      }
      return out;
    };

    const ema12 = ema(12, closes).slice(-1)[0];
    const ema26 = ema(26, closes).slice(-1)[0];
    const macdLine = ema12 - ema26;
    const macdArr = ema(12, closes).map((e, i) => e - (ema(26, closes)[i] || e));
    const signal = ema(9, macdArr).slice(-1)[0];
    const hist = macdLine - signal;
    const rsi14 = rsi(14, closes).slice(-1)[0];
    const sma20Arr = sma(20, closes);
    const sma20 = sma20Arr.slice(-1)[0];

    const last = closes.at(-1);
    const trend =
      last > ema12 && ema12 > ema26 ? "alcista" :
      last < ema12 && ema12 < ema26 ? "bajista" : "indefinida";

    const summary =
      `Símbolo: ${symbol} (${interval})
Último: ${last}
EMA12: ${ema12?.toFixed(2)} | EMA26: ${ema26?.toFixed(2)}  → Tendencia ${trend}.
MACD: ${macdLine?.toFixed(3)} | Señal: ${signal?.toFixed(3)} | Hist: ${hist?.toFixed(3)} (${hist > 0 ? "bullish" : "bearish"}).
RSI(14): ${rsi14?.toFixed(1)} (${rsi14 > 70 ? "sobrecompra" : rsi14 < 30 ? "sobreventa" : "neutral"}).
SMA20: ${sma20?.toFixed(2)}.
Notas: usá confluencia de señales y gestión de riesgo; no es recomendación financiera.`

    res.json({ summary });
  } catch (e) {
    res.status(500).json({ error: "ta", message: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor listo en :" + PORT));
