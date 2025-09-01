// ===============================
// app.js — Top 10 mejores precios (más baratos primero)
// ===============================

// --- configuración rápida ---
const PAIR = 'BTC/USDT';          // par visible en la UI
const REFRESH_MS = 30_000;        // cada cuánto refrescar

// Normalizaciones de símbolos por exchange
const mapSymbol = {
  binance: (pair) => pair.replace('/', ''),           // BTC/USDT -> BTCUSDT
  kucoin:  (pair) => pair.replace('/', '-'),          // BTC/USDT -> BTC-USDT
  bybit:   (pair) => pair.replace('/', ''),           // BTC/USDT -> BTCUSDT
};

// Definición de fuentes (endpoints públicos con CORS)
const SOURCES = [
  {
    ex: 'Binance',
    url: (pair) =>
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${mapSymbol.binance(pair)}`,
    parse: (json) => ({
      price: +json.lastPrice,
      change: +json.priceChangePercent,
    }),
  },
  {
    ex: 'KuCoin',
    url: (pair) =>
      `https://api.kucoin.com/api/v1/market/stats?symbol=${mapSymbol.kucoin(pair)}`,
    parse: (json) => ({
      price: +json.data.last,
      change: (+json.data.changeRate) * 100,
    }),
  },
  {
    ex: 'Bybit',
    url: (pair) =>
      `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${mapSymbol.bybit(pair)}`,
    parse: (json) => {
      const t = json?.result?.list?.[0];
      return { price: +t?.lastPrice, change: +t?.price24hPcnt * 100 };
    },
  },
  // 👇 si querés agregar más, copiá este bloque y ajustá url/parse
  // { ex: 'Bitget', url: (pair) => '...', parse: (j) => ({ price: ..., change: ... }) },
];

// ------------------------------
// Utilidades UI
// ------------------------------
const $ = (s, el = document) => el.querySelector(s);
const pricesEl = $('#prices');

const fmt = (n) =>
  Number(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function renderRows(rows) {
  pricesEl.innerHTML = rows
    .map((r) => {
      const body =
        r.error
          ? `<div class="price down">—</div>`
          : `<div class="price ${r.change >= 0 ? 'up' : 'down'}">${fmt(r.price)}</div>`;

      return `
      <article class="tile" role="group" aria-label="${PAIR} en ${r.ex}">
        <div class="row">
          <div>
            <div class="sym">${PAIR}</div>
            <div class="ex">${r.ex}</div>
          </div>
          ${body}
        </div>
      </article>`;
    })
    .join('');
}

// ------------------------------
// Core: traer precios y ordenar top 10 (baratos primero)
// ------------------------------
async function fetchOne(src, pair) {
  try {
    const res = await fetch(src.url(pair), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const { price, change } = src.parse(json) || {};
    if (!isFinite(price)) throw new Error('precio inválido');
    return { sym: pair, ex: src.ex, price, change };
  } catch (e) {
    return { sym: pair, ex: src.ex, error: String(e) };
  }
}

async function loadOnce() {
  // Traer todos en paralelo
  const results = await Promise.all(SOURCES.map((s) => fetchOne(s, PAIR)));

  // Filtrar los que tengan precio válido
  const ok = results.filter((r) => !r.error && isFinite(r.price));

  // Ordenar por precio ascendente (mejores para COMPRAR primero)
  ok.sort((a, b) => a.price - b.price);

  // Tomar top 10 y agregar los fallidos (opcional) para mostrar mensaje
  const failed = results.filter((r) => r.error).map((r) => ({ ...r, price: NaN, change: 0 }));
  const top10 = ok.slice(0, 10);
  renderRows([...top10, ...failed]); // primero los mejores, luego los que fallaron
}

// Primera carga + refresco
loadOnce();
setInterval(loadOnce, REFRESH_MS);

// (Opcional) si querés permitir cambiar el par desde querystring ?pair=ETH/USDT
const qs = new URLSearchParams(location.search);
const qPair = qs.get('pair');
if (qPair && /^[A-Z]+\/[A-Z]+$/.test(qPair)) {
  // recargar la página con ese par (simple)
  // en una versión más completa podríamos re-wirear PAIR dinámicamente.
}
