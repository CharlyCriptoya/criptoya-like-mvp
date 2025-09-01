/* ========= Comparador: Tabs + Top10 + Lista completa ========= */
const REFRESH_MS = 30_000;                 // actualización periódica
const SUB = document.getElementById('subtitle');
const $ = (s, el=document)=>el.querySelector(s);
const pricesEl = $('#prices');
const fullEl   = $('#full-list');
const fmt = n => Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});

const ASSETS = [
  { key:'USDT_ARS', label:'USDT/ARS', type:'p2p', asset:'usdt' },
  { key:'USDC_ARS', label:'USDC/ARS', type:'p2p', asset:'usdc' },
  { key:'DAI_ARS',  label:'DAI/ARS',  type:'p2p', asset:'dai'  },
  { key:'BTC_USDT', label:'BTC/USDT', type:'spot', base:'BTC', quote:'USDT' },
  { key:'ETH_USDT', label:'ETH/USDT', type:'spot', base:'ETH', quote:'USDT' },
  { key:'BNB_USDT', label:'BNB/USDT', type:'spot', base:'BNB', quote:'USDT' },
  { key:'SOL_USDT', label:'SOL/USDT', type:'spot', base:'SOL', quote:'USDT' },
  { key:'ADA_USDT', label:'ADA/USDT', type:'spot', base:'ADA', quote:'USDT' },
];

/* ----- fuentes spot (precio último y variación) ----- */
const SPOT = [
  {
    ex: 'Binance',
    url: (b,q)=>`https://api.binance.com/api/v3/ticker/24hr?symbol=${b}${q}`,
    parse: j => ({ price:+j.lastPrice, change:+j.priceChangePercent }),
  },
  {
    ex: 'KuCoin',
    url: (b,q)=>`https://api.kucoin.com/api/v1/market/stats?symbol=${b}-${q}`,
    parse: j => ({ price:+j.data?.last, change:+j.data?.changeRate*100 }),
  },
  {
    ex: 'Bybit',
    url: (b,q)=>`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${b}${q}`,
    parse: j => {
      const t=j?.result?.list?.[0]; return { price:+t?.lastPrice, change:+t?.price24hPcnt*100 };
    },
  },
];

/* ----- fuentes P2P ARS por CriptoYA (mejor ask para comprar) ----- */
const P2P = [
  { ex:'Binance P2P', url:a=>`https://criptoya.com/api/binancep2p/${a}/ars/1`, parse:j=>({price:+(j?.ask??j?.price)}) },
  { ex:'OKX P2P',     url:a=>`https://criptoya.com/api/okxp2p/${a}/ars/1`,     parse:j=>({price:+(j?.ask??j?.price)}) },
  { ex:'Bybit P2P',   url:a=>`https://criptoya.com/api/bybitp2p/${a}/ars/1`,    parse:j=>({price:+(j?.ask??j?.price)}) },
  { ex:'MEXC P2P',    url:a=>`https://criptoya.com/api/mexcp2p/${a}/ars/1`,     parse:j=>({price:+(j?.ask??j?.price)}) },
  { ex:'BingX P2P',   url:a=>`https://criptoya.com/api/bingxp2p/${a}/ars/1`,    parse:j=>({price:+(j?.ask??j?.price)}) },
];

async function jget(url){
  const r = await fetch(url, { cache:'no-store' });
  if(!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/* obtiene y ordena por precio ascendente (los más baratos primero) */
async function getSpotRows(base, quote){
  const rows = await Promise.all(SPOT.map(async s=>{
    try{
      const j = await jget(s.url(base, quote));
      const {price, change} = s.parse(j)||{};
      if(!isFinite(price)) throw 0;
      return { ex:s.ex, price:+price, change:+(change??0) };
    }catch(_){ return { ex:s.ex, price:NaN, change:0 }; }
  }));
  return rows.sort((a,b)=>(isFinite(a.price)?a.price:Infinity)-(isFinite(b.price)?b.price:Infinity));
}

async function getP2PRows(asset){
  const rows = await Promise.all(P2P.map(async s=>{
    try{
      const j = await jget(s.url(asset));
      const {price} = s.parse(j)||{};
      if(!isFinite(price)) throw 0;
      return { ex:s.ex, price:+price, change:0 };
    }catch(_){ return { ex:s.ex, price:NaN, change:0 }; }
  }));
  return rows.sort((a,b)=>(isFinite(a.price)?a.price:Infinity)-(isFinite(b.price)?b.price:Infinity));
}

/* UI */
function renderTabs(activeKey){
  const holder = $('#asset-tabs');
  holder.innerHTML = ASSETS.map(a=>`
    <button role="tab" aria-selected="${a.key===activeKey}" data-key="${a.key}">
      ${a.label}
    </button>`).join('');
  holder.querySelectorAll('button').forEach(b=>{
    b.onclick = ()=> selectAsset(b.dataset.key);
  });
}

function renderTop10(rows, pair){
  pricesEl.innerHTML = rows.slice(0,10).map(r=>`
    <article class="tile" role="group" aria-label="${pair} en ${r.ex}">
      <div class="row">
        <div><div class="sym">${pair}</div><div class="ex">${r.ex}</div></div>
        <div class="price ${isFinite(r.change)?(r.change>=0?'up':'down'):''}">
          ${isFinite(r.price)?fmt(r.price):'—'}
        </div>
      </div>
    </article>`).join('');
}

function renderFull(rows, pair){
  fullEl.innerHTML = `
    <div style="margin:6px 4px 8px;opacity:.95;font-weight:700">Todos los exchanges (${pair})</div>
    <div style="overflow:auto">
      <table>
        <thead><tr><th>Exchange</th><th>Precio</th></tr></thead>
        <tbody>
          ${rows.map(r=>`
            <tr><td>${r.ex}</td><td>${isFinite(r.price)?fmt(r.price):'—'}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

let currentKey = ASSETS[0].key;
let timer = null;

async function selectAsset(key){
  currentKey = key;
  renderTabs(key);

  const a = ASSETS.find(x=>x.key===key);
  const pairLabel = a.label;
  SUB.innerHTML = `Mostrando los <b>10 mejores</b> precios de <b>${pairLabel}</b> (se actualiza cada ${(REFRESH_MS/1000)}s).`;

  // “skeleton” mientras carga
  renderTop10(Array.from({length:6}).map(()=>({ex:'—',price:NaN,change:0})), pairLabel);
  renderFull([], pairLabel);

  try{
    const rows = (a.type==='spot')
      ? await getSpotRows(a.base, a.quote)
      : await getP2PRows(a.asset);

    const valid = rows.filter(r=>isFinite(r.price));
    renderTop10(valid, pairLabel);
    renderFull(rows, pairLabel);
  }catch(e){
    SUB.textContent = `No pudimos cargar ${pairLabel}. Probá recargar.`;
  }

  if(timer) clearInterval(timer);
  timer = setInterval(()=>selectAsset(currentKey), REFRESH_MS);
}

/* init */
renderTabs(currentKey);
selectAsset(currentKey);
