// ===============================
// app.js — Precios en tiempo real
// Fuentes: Binance y KuCoin (endpoints públicos)
// ===============================

// Helpers
const $ = (s, el = document) => el.querySelector(s);
const pricesEl = $('#prices');

const fmt = (n) =>
  Number(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Render
function renderRows(rows) {
  pricesEl.innerHTML = rows
    .map((r) => {
      if (r.error) {
        return `
        <article class="tile" role="group" aria-label="${r.sym} en ${r.ex}">
          <div class="row">
            <div>
              <div class="sym">${r.sym}</div>
              <div class="ex">${r.ex}</div>
            </div>
            <div class="price down">—</div>
          </div>
          <div style="font-size:12px;opacity:.75;margin-top:6px">
            No se pudo cargar (red o límite de la API). Reintentando…
          </div>
        </article>`;
      }
      return `
        <article class="tile" role="group" aria-label="${r.sym} en ${r.ex}">
          <div class="row">
            <div>
              <div class="sym">${r.sym}</div>
              <div class="ex">${r.ex}</div>
            </div>
            <div class="price ${r.change >= 0 ? 'up' : 'down'}">
              ${fmt(r.price)}
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

// ------------------------------
// Fetchers por exchange
// ------------------------------

// BINANCE — 24h stats
async function fetchBinance(symbol /* 'BTCUSDT' */) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('binance ' + res.status);
  const j = await res.json();
  return {
    price: +j.lastPrice,
    change: +j.priceChangePercent, // % últimas 24h
  };
}

// KUCOIN — market stats
async function fetchKuCoin(symbol /* 'BTC-USDT' */) {
  const url = `https://api.kucoin.com/api/v1/market/stats?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('kucoin ' + res.status);
  const { data } = await res.json();
  return {
    price: +data.last,
    change: (+data.changeRate) * 100, // viene como 0.0123 => 1.23%
  };
}

// ------------------------------
// Qué pares mostramos
// ------------------------------
const SOURCES = [
  // Binance
  { sym: 'BTC/USDT', ex: 'Binance', fetcher: () => fetchBinance('BTCUSDT') },
  { sym: 'ETH/USDT', ex: 'Binance', fetcher: () => fetchBinance('ETHUSDT') },

  // KuCoin
  { sym: 'BTC/USDT', ex: 'KuCoin',  fetcher: () => fetchKuCoin('BTC-USDT') },
  { sym: 'ETH/USDT', ex: 'KuCoin',  fetcher: () => fetchKuCoin('ETH-USDT') },
];

// ------------------------------
// Carga inicial + refresco
// ------------------------------
async function loadOnce() {
  const results = await Promise.allSettled(SOURCES.map((s) => s.fetcher()));
  const rows = results.map((res, i) => {
    const base = { sym: SOURCES[i].sym, ex: SOURCES[i].ex };
    if (res.status === 'fulfilled') return { ...base, ...res.value };
    return { ...base, error: true, price: NaN, change: 0 };
  });
  renderRows(rows);
}

loadOnce();
// refrescá cada 30s (ajustá si querés)
setInterval(loadOnce, 30_000);
