/* =========================================================
   CriptoYA Like — selector de moneda + Top 10 + lista completa
   Sin tocar index.html: este script inyecta los tabs y la tabla.
   ========================================================= */

// ------------ Config rápida ------------
const REFRESH_MS = 30_000;

// Monedas disponibles (tag visible y tipo de origen)
const ASSETS = [
  { key: 'USDT_ARS', label: 'USDT/ARS', type: 'p2p' },
  { key: 'USDC_ARS', label: 'USDC/ARS', type: 'p2p' },
  { key: 'DAI_ARS',  label: 'DAI/ARS',  type: 'p2p' },
  { key: 'BTC_USDT', label: 'BTC/USDT', type: 'spot' },
  { key: 'ETH_USDT', label: 'ETH/USDT', type: 'spot' },
  { key: 'BNB_USDT', label: 'BNB/USDT', type: 'spot' },
  { key: 'SOL_USDT', label: 'SOL/USDT', type: 'spot' },
  { key: 'ADA_USDT', label: 'ADA/USDT', type: 'spot' },
];

// Exchanges / fuentes compatibles desde front (CORS abierto o tolerante)
const SPOT_SOURCES = [
  {
    ex: 'Binance',
    url: (base, quote) => `https://api.binance.com/api/v3/ticker/24hr?symbol=${base}${quote}`,
    parse: j => ({ price: +j.lastPrice, change: +j.priceChangePercent }),
    symbolMap: (b, q) => [b, q], // BTC,USDT -> BTCUSDT
  },
  {
    ex: 'KuCoin',
    url: (base, quote) => `https://api.kucoin.com/api/v1/market/stats?symbol=${base}-${quote}`,
    parse: j => ({ price: +j.data.last, change: (+j.data.changeRate) * 100 }),
    symbolMap: (b, q) => [b, q], // BTC,USDT -> BTC-USDT
  },
  {
    ex: 'Bybit',
    url: (base, quote) => `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${base}${quote}`,
    parse: j => {
      const t = j?.result?.list?.[0];
      return { price: +t?.lastPrice, change: +t?.price24hPcnt * 100 };
    },
    symbolMap: (b, q) => [b, q],
  },
  // Podés agregar más acá siguiendo el mismo formato.
];

// ⚠️ P2P/ARS: acá apuntamos a CriptoYA (ajustá si tenés otro endpoint)
const P2P_SOURCES = [
  // La API pública de CriptoYA suele exponer rutas por exchange.
  // Usamos varias y las normalizamos (si alguna falla, se omite).
  {
    ex: 'Binance P2P',
    url: (asset) => `https://criptoya.com/api/binancep2p/${asset}/ars/1`,
    parse: j => ({ price: +j?.ask || +j?.price || NaN, change: 0 }),
  },
  {
    ex: 'OKX P2P',
    url: (asset) => `https://criptoya.com/api/okxp2p/${asset}/ars/1`,
    parse: j => ({ price: +j?.ask || +j?.price || NaN, change: 0 }),
  },
  {
    ex: 'Bybit P2P',
    url: (asset) => `https://criptoya.com/api/bybitp2p/${asset}/ars/1`,
    parse: j => ({ price: +j?.ask || +j?.price || NaN, change: 0 }),
  },
  {
    ex: 'MEXC P2P',
    url: (asset) => `https://criptoya.com/api/mexcp2p/${asset}/ars/1`,
    parse: j => ({ price: +j?.ask || +j?.price || NaN, change: 0 }),
  },
  {
    ex: 'BingX P2P',
    url: (asset) => `https://criptoya.com/api/bingxp2p/${asset}/ars/1`,
    parse: j => ({ price: +j?.ask || +j?.price || NaN, change: 0 }),
  },
  // Agregá más P2P si querés (Bitget, Huobi, etc.) manteniendo el formato.
];

// ------------ Helpers de UI ------------
const $ = (s, el = document) => el.querySelector(s);
const pricesEl = $('#prices');

const fmt = (n) =>
  Number(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function setSubtitle(text) {
  const sub = document.querySelector('.sub');
  if (sub) sub.textContent = text;
}

// Crea/inyecta contenedor de tabs y tabla completa
function ensureScaffolding() {
  // Tabs
  let tabs = document.getElementById('asset-tabs');
  if (!tabs) {
    tabs = document.createElement('div');
    tabs.id = 'asset-tabs';
    tabs.style.display = 'flex';
    tabs.style.flexWrap = 'wrap';
    tabs.style.gap = '8px';
    tabs.style.marginBottom = '12px';
    tabs.setAttribute('role', 'tablist');
    pricesEl.parentElement.insertBefore(tabs, pricesEl); // arriba de la grilla
  }

  // Tabla completa
  let full = document.getElementById('full-list');
  if (!full) {
    full = document.createElement('section');
    full.id = 'full-list';
    full.style.marginTop = '16px';
    pricesEl.parentElement.appendChild(full);
  }
}

// Renderiza tabs
function renderTabs(activeKey) {
  const tabs = document.getElementById('asset-tabs');
  tabs.innerHTML = ASSETS.map(a => `
    <button data-key="${a.key}" role="tab"
      style="
        padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.25);
        background:${a.key===activeKey?'rgba(255,255,255,.2)':'transparent'};
        color:#fff;cursor:pointer;backdrop-filter:blur(4px);
      ">
      ${a.label}
    </button>
  `).join('');

  // listeners
  tabs.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      selectAsset(key);
    });
  });
}

// Renderiza Top 10 (grilla original)
function renderTop10(rows, pairLabel) {
  pricesEl.innerHTML = rows.map(r => `
    <article class="tile" role="group" aria-label="${pairLabel} en ${r.ex}">
      <div class="row">
        <div>
          <div class="sym">${pairLabel}</div>
          <div class="ex">${r.ex}</div>
        </div>
        <div class="price ${isFinite(r.price) ? (r.change >= 0 ? 'up' : 'down') : ''}">
          ${isFinite(r.price) ? fmt(r.price) : '—'}
        </div>
      </div>
    </article>
  `).join('');
}

// Renderiza tabla completa debajo
function renderFullList(allRows, pairLabel) {
  const cont = document.getElementById('full-list');
  cont.innerHTML = `
    <div style="margin:8px 4px 6px;opacity:.9;font-weight:600;">Todos los exchanges (${pairLabel})</div>
    <div style="overflow:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.2)">Exchange</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid rgba(255,255,255,.2)">Precio</th>
          </tr>
        </thead>
        <tbody>
          ${allRows.map(r => `
            <tr>
              <td style="padding:8px;border-bottom:1px dashed rgba(255,255,255,.12)">${r.ex}</td>
              <td style="padding:8px;text-align:right;border-bottom:1px dashed rgba(255,255,255,.12)">
                ${isFinite(r.price) ? fmt(r.price) : '—'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ------------ Fetchers ------------
async function safeFetch(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchSpotAll(base, quote) {
  const tasks = SPOT_SOURCES.map(async (s) => {
    try {
      const [b, q] = s.symbolMap(base, quote);
      const j = await safeFetch(s.url(b, q));
      const { price, change } = s.parse(j) || {};
      if (!isFinite(price)) throw new Error('precio inválido');
      return { ex: s.ex, price, change: change ?? 0 };
    } catch (e) {
      return { ex: s.ex, price: NaN, change: 0, error: String(e) };
    }
  });
  const rows = await Promise.all(tasks);
  // ordenar más baratos primero
  return rows.sort((a, b) =>
    (isFinite(a.price) ? a.price : Infinity) - (isFinite(b.price) ? b.price : Infinity)
  );
}

async function fetchP2PAll(asset /* 'usdt' | 'usdc' | 'dai' */) {
  const tasks = P2P_SOURCES.map(async (s) => {
    try {
      const j = await safeFetch(s.url(asset.toLowerCase()));
      const { price } = s.parse(j) || {};
      if (!isFinite(price)) throw new Error('precio inválido');
      return { ex: s.ex, price, change: 0 };
    } catch (e) {
      return { ex: s.ex, price: NaN, change: 0, error: String(e) };
    }
  });
  const rows = await Promise.all(tasks);
  return rows.sort((a, b) =>
    (isFinite(a.price) ? a.price : Infinity) - (isFinite(b.price) ? b.price : Infinity)
  );
}

// ------------ Orquestación ------------
let currentKey = ASSETS[0].key;
let timer = null;

async function selectAsset(key) {
  currentKey = key;
  renderTabs(currentKey);

  // Determinar tipo y par visible
  const a = ASSETS.find(x => x.key === key);
  let pairLabel = a.label;

  // Subtítulo
  setSubtitle(`Mostrando los 10 mejores precios para comprar ${pairLabel}.`);

  // Loading rápido
  renderTop10(Array.from({ length: 6 }).map(() => ({ ex: '—', price: NaN, change: 0 })), pairLabel);
  renderFullList([], pairLabel);

  try {
    let rows = [];
    if (a.type === 'spot') {
      const [base, quote] = key.split('_'); // BTC_USDT -> ['BTC','USDT']
      rows = await fetchSpotAll(base, quote);
    } else {
      // p2p: USDT_ARS -> ['USDT', 'ARS']
      const [asset /*, fiat*/] = key.split('_');
      rows = await fetchP2PAll(asset);
    }

    const ok = rows.filter(r => isFinite(r.price));
    const top10 = ok.slice(0, 10);
    renderTop10(top10, pairLabel);
    renderFullList(rows, pairLabel);
  } catch (e) {
    setSubtitle(`No pudimos cargar ${pairLabel}. Probá recargar la página.`);
    renderFullList([], pairLabel);
  }

  // refresco
  if (timer) clearInterval(timer);
  timer = setInterval(() => selectAsset(currentKey), REFRESH_MS);
}

// ------------ Inicio ------------
(function init() {
  ensureScaffolding();
  renderTabs(currentKey);
  selectAsset(currentKey);
})();
