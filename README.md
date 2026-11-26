# Monitor Pullback SMA — IBEX 35, DAX 40 y S&P 500

Aplicación financiera profesional en español para monitorizar acciones en tiempo real y detectar **pullbacks hacia las medias móviles simples SMA 50 y SMA 200** en los índices **IBEX 35**, **DAX 40**, **S&P 500**, el universo combinado **Europa (75)** y **Watchlists personalizadas**.

El repositorio es **100% dual-compatible**:
1. **Frontend Estático Profesional (Vite + React 19 + TypeScript + Tailwind CSS v4)** preparado para **GitHub Pages**, **Vercel** o **Netlify** (`base: './'`).
2. **Aplicación Python / Streamlit (`app.py`)** lista para **Streamlit Community Cloud** con descarga vectorizada mediante `yfinance` (`yf.download(..., threads=True)`), gráfico interactivo **Plotly** y respaldo automático contra `query1` / `query2`.

---

## Características Principales

- **Fuente Única de Verdad (`data/tickers.json`)**: Los **580 valores oficiales** (35 del IBEX 35 con `.MC`, 40 del DAX 40 con `.DE` y 505 del S&P 500) son compartidos exactamente entre TypeScript y Python, incluyendo soporte para **Europa (75)**.
- **Ventana WATCHLIST Interactiva en Pantalla Principal**: Sección permanente de seguimiento con persistencia en `localStorage`, sincronización en vivo con el caché multi-mercado (Precio, Var. %, Dist. SMA 50/200, MACD, RSI 14 y estado de pullback), **visor de gráfico OHLC en tiempo real con SMA 50/200, MACD (12, 26, 9), RSI (14) y ATR (14)** por cada acción de la lista (con carga individual bajo demanda), alta/baja instantánea con `★`, escaneo directo e importación/exportación JSON/TXT (incluyendo prefijos `BME:`/`XETR:`).
- **Gráfico Interactivo OHLC + SMA 50 / SMA 200 + MACD**: Visualizador SVG responsivo sin dependencias externas en React (y Plotly en Streamlit) con banda sombreada `±umbral%`, volumen inferior, panel **MACD (12, 26, 9)** y tooltip *crosshair* con **RSI (14)** y **MACD**.
- **Filtros Técnicos Avanzados (en memoria, sin peticiones extra)**:
  - **Golden Cross**: Filtra valores con `SMA 50 > SMA 200`.
  - **Cruce MACD (al alza)**: Filtra valores cuya línea `MACD (12, 26)` cruza al alza sobre su `Señal EMA (9)` (`MACD anterior ≤ Señal anterior` y `MACD actual > Señal actual`).
  - **MACD (12, 26, 9)** en tabla, detalle, gráfico y CSV (`MACD`, `Señal`, `Histograma` y estado de cruce).
  - **RSI (14)** suavizado de Wilder: Filtro rápido `< 55` o zona pullback `35–55`.
  - **ATR (14)** de Wilder y **Distancia Normalizada en ATR** `(Cierre - SMA) / ATR(14)`.
  - **Volumen Relativo mínimo** sobre media de 20 velas (`≥ 1,2x`, `≥ 1,5x`, `≥ 2,0x`).
- **Backtest Histórico Rápido**: Evalúa sobre la serie histórica descargada (`2y` diaria o `5y` semanal) los rebotes previos en SMA 50 y SMA 200, calculando tasa de acierto y retorno medio a `+5` y `+10` velas.
- **Triple Estrategia en Tiempo Real (<10 ms)**:
  - **Modo A — Zona de Proximidad (`±%`)**: Tendencia alcista/neutra en SMA, precio previo por encima hace 5–15 velas y distancia porcentual dentro de `[-umbral%, +umbral%]`.
  - **Modo B — Toque y Rebote Estricto**: Mínimo de la vela actual o anterior `≤ SMA × 1.002` con cierre actual estrictamente superior a la media (`Close > SMA`).
  - **Modo C — Pullback + Cruce MACD (al alza)**: Combina señal de pullback en SMA 50/200 (Modo A o Modo B) con cruce alcista confirmado del MACD `(12, 26, 9)` en la vela actual.
- **Control Anti-Errores, Caché TTL 5 min y Exportación**:
  - Cancelación instantánea con `AbortController`, descarga por lotes controlados (`6` tickers cada `300 ms` en navegador / `yf.download` vectorizado en Streamlit), micro-barras centradas en `0.00%`, enlaces directos a Yahoo Finance, **Exportar CSV** (Excel regional español UTF-8 BOM + `;`) y **Copiar Tickers** para TradingView.
- **Pipeline GitHub Actions (`.github/workflows/ci.yml`)**: Valida `tsc --noEmit`, `npm run build`, `py_compile`, paridad matemática y conteo de `data/tickers.json` en cada *push* o *pull request*.

---

## Estructura del Repositorio

```text
├── .github/workflows/
│   └── ci.yml                  # CI/CD: TypeScript, Vite, Python py_compile y SSOT
├── .streamlit/
│   └── config.toml             # Tema corporativo Modo Claro para Streamlit
├── data/
│   └── tickers.json            # Fuente Única de Verdad (35 IBEX + 40 DAX + 505 S&P 500)
├── app.py                      # Aplicación principal compatible con Streamlit Cloud
├── requirements.txt            # Dependencias Python (streamlit, pandas, requests, yfinance, plotly)
├── streamlit_core/
│   ├── __init__.py
│   ├── tickers_data.py         # Cargador SSOT desde data/tickers.json + Europa/Watchlist
│   ├── yahoo_service.py        # yf.download vectorizado + fallback query1/query2 y velas 4h
│   └── indicators.py           # SMA 50/200, MACD(12,26,9), RSI(14), ATR(14), Golden Cross y Backtest
├── src/
│   ├── components/
│   │   ├── CandlestickChart.tsx    # Gráfico OHLC SVG interactivo + SMA 50/200 + panel MACD(12,26,9)
│   │   ├── MethodologyView.tsx
│   │   ├── OmittedTickersPanel.tsx
│   │   ├── ResultsTable.tsx        # Tabla ordenable, Watchlist, MACD, RSI, Dist. ATR y micro-barras
│   │   ├── ScannerControls.tsx     # Selectores de mercado, filtros técnicos (Golden Cross, Cruce MACD) y Watchlist
│   │   ├── StockDetailDrawer.tsx   # Auditoría matemática, MACD, gráfico OHLC y Backtest rápido
│   │   ├── TopBar.tsx
│   │   ├── UniverseView.tsx
│   │   └── WatchlistPanel.tsx      # Ventana WATCHLIST permanente en pantalla principal
│   ├── data/tickersData.ts     # Cargador SSOT desde data/tickers.json
│   ├── services/
│   │   ├── marketCache.ts      # Caché Map `${mercado}_${temporalidad}` (TTL 5 min)
│   │   ├── watchlistService.ts # Persistencia Watchlist en localStorage + JSON/TXT
│   │   └── yahooService.ts     # Conector Yahoo Finance con proxies CORS en cascada
│   ├── types/market.ts
│   ├── utils/indicators.ts     # Motor matemático TS (SMA, RSI 14, ATR 14, Backtest rápido)
│   └── App.tsx
├── package.json
├── tsconfig.json
└── vite.config.ts              # base: './' para subrutas GitHub Pages
```

---

## Instalación y Uso Local

### Opción 1: Frontend React + Vite + TypeScript

```bash
npm install
npm run dev
```

Compilación y verificación de tipos:

```bash
npm run lint
npm run build
```

### Opción 2: Aplicación Python + Streamlit

```bash
pip install -r requirements.txt
streamlit run app.py
```

---

## Despliegue para GitHub

- **GitHub Pages / Vercel / Netlify (Estático)**: Configurado con `base: './'` en `vite.config.ts`. Ejecuta `npm run build` y publica la carpeta `dist/`. No requiere claves API ni variables de entorno privadas.
- **Streamlit Community Cloud**: Selecciona el repositorio y apunta el archivo principal a `app.py` (las dependencias de `requirements.txt` se instalan automáticamente).
