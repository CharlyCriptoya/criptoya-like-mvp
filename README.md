# Cripto Cotizaciones (MVP)

Un demo listo-para-ejecutar que agrega cotizaciones de varias **exchanges** en tiempo (casi) real, calcula el **mejor precio de compra/venta** y detecta **oportunidades de arbitraje** (spread efectivo luego de fees).

## Características
- Backend en Node.js (Express) con **SSE** para actualizaciones en vivo.
- Adaptadores de exchanges modulares (incluye `binance` y `coinbase` como ejemplo).
- Normalización de `bid/ask/last`, caché en memoria y **umbral de arbitraje** configurable.
- Frontend estático (HTML/JS) servido por el mismo servidor.

> Este proyecto es educativo y un punto de partida. Antes de usar en producción: añade más exchanges, valida fees reales, considera latencia, límites de rate y custody/settlement.

## Requisitos
- Node.js 18+ (usa `fetch` nativa).

## Cómo ejecutar
```bash
cp .env.example .env
npm install
npm run start
# Abre http://localhost:8080
```

## Configuración (.env)
- `EXCHANGES`: lista de adaptadores habilitados (coincide con archivos en `server/exchanges`).
- `SYMBOLS`: pares a monitorear, p.ej. `BTC-USDT,ETH-USDT,USDT-USD`.
- `POLL_MS`: intervalo de sondeo a las APIs públicas.
- `ARBITRAGE_THRESHOLD`: % mínimo de spread efectivo para mostrar oportunidades.

## Agregar un exchange
Crea un archivo en `server/exchanges/<nombre>.js` que exporte `fetchTicker(pair)` y retorne:
```js
{ exchange, base, quote, bid, ask, last, ts }
```
Mirá `binance.js` y `coinbase.js` como referencia.

## Notas Argentina / ARS
- Muchos exchanges locales no exponen libro de órdenes público. Para ARS, deberás integrar APIs oficiales o endpoints P2P **permitidos por sus Términos** (no scraping).
- Añadí un conversor `USDT-ARS` usando tu fuente de tipo de cambio preferida o el precio directo del exchange local.

## Seguridad y cumplimiento
- Respeta Términos de Uso y límites de rate de cada API.
- Considerá riesgos de **latencia**, **slippage**, **retiros/depositos** entre exchanges y **congelamiento de fondos**.
- El arbitraje real suele requerir saldos preposicionados en ambos lados para ejecutar de forma simultánea.

## Licencia
MIT (solo fines educativos, sin garantías).
