// server.js
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static('public', { maxAge: 0 }));

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""; // poné tu key en Render

// ---------- helpers ----------
const ok = (x) => x && (x.status === 200 || x.ok);
const toNum = (v) => (v == null ? null : Number(v));
const nowSec = () => Math.floor(Date.now()/1000);

// dólar (dolarapi)
app.get('/api/dolar', async (_req, res) => {
  try {
    const r = await fetch('https://dolarapi.com/v1/dolares');
    const j = await r.json();
    // normalizo nombres como pediste
    const map = {
      "oficial": "OFICIAL",
      "blue": "BLUE",
      "tarjeta": "TARJETA",
      "mep": "MEP",
      "ccl": "CCL",
      "cripto": "CRIPTO"
    };
    const rows = j.map(x => ({
      nombre: map[x.casa] || (x.casa || '').toUpperCase(),
      venta: x.venta,
      compra: x.compra
    }));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// tasa de referencia USD→ARS (usamos BLUE venta por default; podés cambiar a 'cripto')
async function usdArsRate() {
  try {
    const r = await fetch('https://dolarapi.com/v1/dolares/blue');
    const j = await r.json();
    return Number(j.venta);
  } catch { return null; }
}

// ---------- tickers USD para varios exchanges ----------
async function priceBinance(symbol){ // BTCUSDT
  const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
  if(!ok(r)) throw new Error('binance');
  const j = await r.json();
  return toNum(j.price);
}
async function priceOKX(symbol){ // BTCUSDT -> BTC-USDT
  const inst = symbol.replace('USDT','-USDT');
  const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${inst}`);
  if(!ok(r)) throw new Error('okx');
  const j = await r.json();
  return toNum(j.data?.[0]?.last);
}
async function priceKuCoin(symbol){ // BTCUSDT -> BTC-USDT
  const s = symbol.replace('USDT','-USDT');
  const r = await fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${s}`);
  if(!ok(r)) throw new Error('kucoin');
  const j = await r.json();
  return toNum(j.data?.price);
}
async function priceMEXC(symbol){ // BTCUSDT
  const r = await fetch(`https://api.mexc.com/api/v3/ticker/price?symbol=${symbol}`);
  if(!ok(r)) throw new Error('mexc');
  const j = await r.json();
  return toNum(j.price);
}
async function priceBitget(symbol){ // BTCUSDT
  const r = await fetch(`https://api.bitget.com/api/spot/v1/market/ticker?symbol=${symbol}`);
  if(!ok(r)) throw new Error('bitget');
  const j = await r.json();
  return toNum(j.data?.close);
}
async function priceBybit(symbol){ // BTCUSDT spot
  const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`);
  if(!ok(r)) throw new Error('bybit');
  const j = await r.json();
  return toNum(j.result?.list?.[0]?.lastPrice);
}

const EXCH = [
  { key:'BINANCE', fn:priceBinance, logo:'binance.png' },
  { key:'OKX', fn:priceOKX, logo:'okx.png' },
  { key:'KuCoin', fn:priceKuCoin, logo:'kucoin.png' },
  { key:'MEXC', fn:priceMEXC, logo:'mexc.png' },
  { key:'Bitget', fn:priceBitget, logo:'bitget.png' },
  { key:'Bybit', fn:priceBybit, logo:'bybit.png' }
];

// precios /USDT (ARS + USD)
app.get('/api/precios', async (req, res) => {
  const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
  try {
    const rate = await usdArsRate(); // ARS por USD
    const rows = await Promise.all(EXCH.map(async ex => {
      try {
        const usd = await ex.fn(symbol);
        if (!usd) throw new Error('no price');
        return {
          exchange: ex.key,
          logo: ex.logo,
          pair: symbol,
          bid_usd: usd,
          bid_ars: rate ? usd * rate : null
        };
      } catch (e) {
        return { exchange: ex.key, logo: ex.logo, pair: symbol, error: String(e) };
      }
    }));
    res.json({ rows, usdars: rate, ts: nowSec() });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// klines Binance -> para el gráfico
app.get('/api/candles', async (req, res) => {
  const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
  const interval = (req.query.interval || '1h');
  const limit = Math.min(Number(req.query.limit) || 500, 1000);
  try {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const j = await r.json();
    const rows = j.map(a => ({
      t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5]
    }));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------- indicadores básicos (EMA, RSI, MACD, ATR) ----------
function EMA(values, period){
  const k = 2/(period+1);
  let ema = values[0];
  const out = [ema];
  for (let i=1;i<values.length;i++){
    ema = values[i]*k + ema*(1-k);
    out.push(ema);
  }
  return out;
}
function RSI(closes, period=14){
  let gains=0, losses=0;
  for (let i=1;i<=period;i++){
    const ch = closes[i]-closes[i-1];
    if(ch>=0) gains+=ch; else losses-=ch;
  }
  let rs = gains/Math.max(1e-9, losses);
  const out = Array(period).fill(null); out.push(100-100/(1+rs));
  for(let i=period+1;i<closes.length;i++){
    const ch = closes[i]-closes[i-1];
    const gain = Math.max(0,ch), loss = Math.max(0,-ch);
    gains = (gains*(period-1)+gain)/period;
    losses = (losses*(period-1)+loss)/period;
    rs = gains/Math.max(1e-9,losses);
    out.push(100-100/(1+rs));
  }
  return out;
}
function MACD(closes, f=12, s=26, sig=9){
  const emaF = EMA(closes, f);
  const emaS = EMA(closes, s);
  const macd = closes.map((_,i)=> emaF[i]-emaS[i]);
  const signal = EMA(macd.slice(s-1), sig);
  const hist = macd.slice(s-1).map((m,i)=> m - signal[i]);
  return { macd: macd.slice(s-1), signal, hist };
}

// endpoint de **análisis con ChatGPT**
app.post('/api/ai', async (req, res) => {
  try{
    const { symbol='BTCUSDT', interval='1h' } = req.body || {};
    // traigo velas
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=300`);
    const j = await r.json();
    const closes = j.map(k=> Number(k[4]));
    const highs  = j.map(k=> Number(k[2]));
    const lows   = j.map(k=> Number(k[3]));

    const ema20 = EMA(closes,20).at(-1);
    const ema50 = EMA(closes,50).at(-1);
    const ema200= EMA(closes,200).at(-1);
    const rsi14 = RSI(closes,14).at(-1);
    const {macd, signal, hist} = MACD(closes,12,26,9);
    const last = closes.at(-1);

    const indicators = {
      last, ema20, ema50, ema200,
      rsi14, macd_last: macd.at(-1), signal_last: signal.at(-1), hist_last: hist.at(-1)
    };

    if(!OPENAI_API_KEY){
      // sin key, devolvemos texto guía
      return res.json({ analysis:
        "Falta OPENAI_API_KEY en Render. Agregá la variable y reintentá Pedir análisis.",
        indicators
      });
    }

    const prompt = `
Quiero un ANÁLISIS TÉCNICO PROFESIONAL para ${symbol} (${interval}) como si fueras un analista de trading.
Usá el precio actual y estos indicadores calculados: ${JSON.stringify(indicators)}.
Estructura obligatoria (breve y clara):
1) Tendencia y estructura (HTF/LTF)
2) Soportes y resistencias concretos (números)
3) Momentum (RSI/MACD) y medias (EMA20/50/200)
4) Escenarios probables (alcista y bajista) con invalidaciones
5) Gestión de riesgo (volatilidad aprox, idea de stop/zona)
No des recomendaciones financieras. Español, conciso y útil.
`;

    const ar = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {role:'system', content:'Eres un analista técnico senior, claro y preciso.'},
          {role:'user', content: prompt}
        ],
        temperature: 0.3
      })
    });
    const aj = await ar.json();
    const analysis = aj.choices?.[0]?.message?.content || 'No hubo respuesta del modelo.';
    res.json({ analysis, indicators });
  }catch(e){
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => console.log('MVP en :' + PORT));
