document.addEventListener('DOMContentLoaded', () => {
  const data = [
    { name: 'Binance',  logo: '/assets/logos/binance.svg',  buy: 85000, sell: 85050 },
    { name: 'Bitget',   logo: '/assets/logos/bitget.svg',   buy: 84980, sell: 85060 },
    { name: 'KuCoin',   logo: '/assets/logos/kucoin.svg',   buy: 85010, sell: 85090 },
    { name: 'Coinbase', logo: '/assets/logos/coinbase.svg', buy: 84950, sell: 85120 },
    { name: 'LetsBit',  logo: '/assets/logos/letsbit.svg',  buy: 84990, sell: 85140 },
    { name: 'Lemon',    logo: '/assets/logos/lemon.svg',    buy: 84970, sell: 85110 },
    { name: 'Bitso',    logo: '/assets/logos/bitso.svg',    buy: 84930, sell: 85180 }
  ];

  // Mejor compra = sell más bajo (dónde conviene comprar)
  // Mejor venta  = buy más alto (dónde conviene vender)
  let bestBuyIdx = -1, bestSellIdx = -1;
  let minSell = Infinity, maxBuy = -Infinity;
  data.forEach((ex, i) => {
    if (ex.sell < minSell) { minSell = ex.sell; bestBuyIdx = i; }
    if (ex.buy  > maxBuy)  { maxBuy  = ex.buy;  bestSellIdx = i; }
  });

  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';

  data.forEach((ex, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="exch"><img class="logo" src="${ex.logo}" alt="${ex.name}">${ex.name}</div></td>
      <td class="center">$${ex.buy.toLocaleString('es-AR')}</td>
      <td class="center">$${ex.sell.toLocaleString('es-AR')}</td>
      <td class="center"></td>
    `;
    const tdBadge = tr.children[3];
    if (i === bestBuyIdx)  tdBadge.innerHTML = `<span class="badge bestBuy">Mejor compra</span>`;
    if (i === bestSellIdx) tdBadge.innerHTML = `<span class="badge bestSell">Mejor venta</span>`;
    tbody.appendChild(tr);
  });
});
