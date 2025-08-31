const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

let current = { coin:'USDT', fiat:'ARS', vol:100000 };

// UI
function activate(sel, btn){ $$(sel).forEach(x=>x.classList.remove('active')); btn.classList.add('active'); }
$$('.asset').forEach(b=>b.onclick=()=>{ activate('.asset', b); current.coin=b.dataset.coin; refresh(); });
$$('.fiat').forEach(b=>b.onclick=()=>{ activate('.fiat', b); current.fiat=b.dataset.fiat; refresh(); });
$$('.vol').forEach(b=>b.onclick=()=>{ activate('.vol', b); current.vol=b.dataset.vol; refresh(); });

$('#refresh').onclick = () => refresh();
$('#theme')?.addEventListener('click', () => document.body.classList.toggle('light'));

// API CriptoYa
async function fetchQuotes(coin, fiat, vol){
  const url = `https://criptoya.com/api/${coin}/${fiat}/${vol}`;
  const r = await fetch(url, { headers:{'accept':'application/json'} });
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

// Render con badges
function renderTable(data){
  const tbody = $('#tbody');
  const entries = Object.entries(data).map(([name, d]) => ({ name, ...d }));

  const minAsk = Math.min(...entries.map(e => e.ask ?? Infinity));
  const maxBid = Math.max(...entries.map(e => e.bid ?? -Infinity));

  tbody.innerHTML = '';
  entries
    .sort((a,b) => (a.ask ?? Infinity) - (b.ask ?? Infinity))
    .forEach(e => {
      const isBestSell = e.ask === minAsk;
      const isBestBuy  = e.bid === maxBid;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          ${e.name}
          ${isBestBuy ?  '<span class="badge bestBuy">Mejor compra</span>' : ''}
          ${isBestSell ? '<span class="badge bestSell">Mejor venta</span>' : ''}
        </td>
        <td class="${isBestBuy?'highlight':''}">${fmtARS(e.bid)}</td>
        <td class="${isBestSell?'highlight':''}">${fmtARS(e.ask)}</td>
        <td>${fmtARS(e.totalBid)}</td>
        <td>${fmtARS(e.totalAsk)}</td>
        <td>${fmtTime(e.time)}</td>
      `;
      tbody.appendChild(tr);
    });

  if(!entries.length){
    tbody.innerHTML = '<tr><td colspan="6" class="center muted">Sin datos.</td></tr>';
  }
}

function fmtARS(n){
  if(n==null || !isFinite(n)) return '—';
  return n.toLocaleString('es-AR',{ style:'currency', currency:'ARS', maximumFractionDigits:2 });
}
function fmtTime(t){ try { return new Date(t).toLocaleTimeString(); } catch(e){ return '—'; } }

async function refresh(){
  const tbody = $('#tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="center muted">Cargando…</td></tr>';
  try{
    const data = await fetchQuotes(current.coin, current.fiat, current.vol);
    renderTable(data);
  }catch(e){
    tbody.innerHTML = `<tr><td colspan="6" class="center muted">Error: ${e.message}</td></tr>`;
  }
}

// inicio
refresh();
