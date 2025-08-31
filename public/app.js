// Lista de exchanges con datos de ejemplo
const exchanges = [
  { name: "Binance",  logo: "/assets/logos/binance.svg",  buy: 9870000, sell: 9950000 },
  { name: "Bitget",   logo: "/assets/logos/bitget.svg",   buy: 9865000, sell: 9945000 },
  { name: "KuCoin",   logo: "/assets/logos/kucoin.svg",   buy: 9880000, sell: 9960000 },
  { name: "Coinbase", logo: "/assets/logos/coinbase.svg", buy: 9850000, sell: 9930000 },
  { name: "LetsBit",  logo: "/assets/logos/letsbit.svg",  buy: 9875000, sell: 9955000 },
  { name: "Lemon",    logo: "/assets/logos/lemon.svg",    buy: 9890000, sell: 9970000 },
  { name: "Bitso",    logo: "/assets/logos/bitso.svg",    buy: 9845000, sell: 9925000 },
];

// Función para renderizar la tabla
function renderTable() {
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";

  if (!exchanges.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="center muted">Sin datos</td></tr>`;
    return;
  }

  // Calcular mejores precios
  let bestBuy = Math.min(...exchanges.map(e => e.buy));
  let bestSell = Math.max(...exchanges.map(e => e.sell));

  exchanges.forEach(ex => {
    const tr = document.createElement("tr");

    // Nombre + logo
    const tdName = document.createElement("td");
    tdName.innerHTML = `
      <div class="exch">
        <img class="logo" src="${ex.logo}" alt="${ex.name}">
        ${ex.name}
      </div>
    `;

    // Compra
    const tdBuy = document.createElement("td");
    tdBuy.className = "center";
    tdBuy.textContent = ex.buy.toLocaleString("es-AR");
    if (ex.buy === bestBuy) tdBuy.classList.add("highlight");

    // Venta
    const tdSell = document.createElement("td");
    tdSell.className = "center";
    tdSell.textContent = ex.sell.toLocaleString("es-AR");
    if (ex.sell === bestSell) tdSell.classList.add("highlight");

    // Spread
    const tdSpread = document.createElement("td");
    tdSpread.className = "center";
    let spread = ((ex.sell - ex.buy) / ex.buy * 100).toFixed(2);
    tdSpread.textContent = spread + "%";

    tr.appendChild(tdName);
    tr.appendChild(tdBuy);
    tr.appendChild(tdSell);
    tr.appendChild(tdSpread);

    tbody.appendChild(tr);
  });
}

// Render inicial
renderTable();
