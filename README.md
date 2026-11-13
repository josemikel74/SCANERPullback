# Monitor Pullback SMA — IBEX 35, DAX 40 y S&P 500

Sistema profesional de monitorización bursátil en tiempo real construido con **React 19**, **TypeScript**, **Vite** y **Tailwind CSS v4** para detectar oportunidades de *pullback* hacia las medias móviles simples **SMA 50** y **SMA 200** en los índices **IBEX 35**, **DAX 40** y **S&P 500** (580 valores oficiales completos).

---

## Características Principales

- **Universo Completo sin Recortes**:
  - **IBEX 35** (35 valores `.MC`)
  - **DAX 40** (40 valores `.DE`)
  - **S&P 500** (505 valores NYSE / NASDAQ)
- **Datos Reales desde Yahoo Finance v8**:
  - Mapeo inteligente de temporalidades: `1d` (`2y`), `1w` (`5y`), `1h` (`60d`) y `4h` (`60m` / `180d` agregadas determinísticamente en bloques de 4 velas).
  - Cascada anti-bloqueo CORS con rotación automática de proxies públicos y *timeout* de `8000 ms`, sin necesidad de claves API ni variables de entorno privadas.
  - Procesamiento por lotes de 6 peticiones simultáneas cada `300 ms` con cancelación instantánea mediante `AbortController`.
- **Motor Matemático y Caché en Memoria (<10 ms)**:
  - Limpieza de velas nulas/incompletas y validación estricta de profundidad (`≥ 50` velas para SMA 50 y `≥ 200` velas para SMA 200).
  - **Modo A — Zona de Proximidad (±%)**: exige pendiente alcista/neutra (`SMA actual >= SMA hace 10 velas`), cotización previa sobre la media hace 5–15 velas y distancia porcentual dentro de `[-umbral%, +umbral%]` (por defecto `±1.5%`).
  - **Modo B — Toque y Rebote Estricto**: exige mínimo reciente sobre o bajo la media (`Low <= SMA * 1.002`) viniendo de cotizar por encima hace 5–15 velas, con cierre actual estrictamente superior (`Close > SMA`).
  - Caché en memoria `Map` indexado por `${mercado}_${temporalidad}` con **TTL de 5 minutos** para alternar estrategias y umbrales instantáneamente.
- **UX Corporativa, Auditoría y Exportación**:
  - Columna de distancia porcentual con código cromático semántico (esmeralda encima / ámbar debajo) y **micro-barra visual centrada en 0.00%**.
  - Insignias diferenciadas para **SMA 50** (azul), **SMA 200** (índigo) y **Confluencia 50 + 200** (dorado).
  - Enlace directo en cada ticker hacia Yahoo Finance (`https://finance.yahoo.com/quote/{TICKER}`) y panel auditor de fórmulas al hacer clic en cualquier fila.
  - Panel desplegable de control anti-errores con tickers omitidos por historial insuficiente (`< 200` velas) o error de red.
  - **Exportar CSV** compatible con Excel en español (BOM UTF-8, separador `;` y decimales con coma) y **Copiar Tickers** en formato TradingView (`BME:`, `XETR:`, etc.).

---

## Arquitectura del Repositorio

```text
├── index.html                           # Metadatos SEO y tipografía tabular (Plus Jakarta Sans / JetBrains Mono)
├── package.json                         # Dependencias estándar (react, react-dom, lucide-react, tailwindcss)
├── tsconfig.json                        # Configuración TypeScript estricta (strict + noUnusedLocals)
├── vite.config.ts                       # Configurado con base: './' para dominio raíz o subrutas de GitHub Pages
└── src/
    ├── types/
    │   └── market.ts                    # Interfaces estrictas para mercados, velas, diagnósticos y caché
    ├── data/
    │   └── tickersData.ts               # Listados maestros completos (IBEX 35, DAX 40, S&P 500)
    ├── services/
    │   ├── yahooService.ts              # Conector Yahoo Finance v8, proxies CORS en cascada y AbortController
    │   └── marketCache.ts               # Caché en memoria Map por ${mercado}_${temporalidad} (TTL 5 min)
    ├── utils/
    │   └── indicators.ts                # Limpieza OHLC, cálculo SMA 50/200 y evaluación Modo A / Modo B
    ├── components/
    │   ├── TopBar.tsx                   # Barra superior corporativa
    │   ├── ScannerControls.tsx          # Controles de mercado, temporalidad, estrategia y filtros
    │   ├── ResultsTable.tsx             # Tabla ordenable, micro-barras 0.00%, insignias y exportación
    │   ├── StockDetailDrawer.tsx        # Auditoría matemática detallada por valor
    │   ├── OmittedTickersPanel.tsx      # Panel desplegable de tickers omitidos o incidencias
    │   ├── UniverseView.tsx             # Directorio completo buscable de los 580 valores
    │   └── MethodologyView.tsx          # Documentación de fórmulas y arquitectura
    ├── App.tsx                          # Estado principal y orquestación
    ├── main.tsx                         # Punto de entrada React
    └── index.css                        # Estilos globales Tailwind CSS v4
```

---

## Instalación y Desarrollo Local

Requisitos previos: **Node.js 20+** y **npm 10+**.

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/monitor-pullbacks-sma.git
cd monitor-pullbacks-sma

# 2. Instalar dependencias
npm install

# 3. Iniciar servidor de desarrollo
npm run dev
```

### Verificación de Tipos y Compilación

```bash
# Comprobar tipos TypeScript en modo estricto
npm run lint

# Compilar artefacto estático para producción en dist/
npm run build

# Previsualizar el build de producción
npm run preview
```

---

## Despliegue en GitHub Pages, Vercel o Netlify

El archivo `vite.config.ts` incluye `base: './'`, por lo que el directorio generado `dist/` funciona de forma autónoma tanto en dominios raíz como en subrutas de proyecto (`https://usuario.github.io/nombre-repo/`):

- **GitHub Pages**: Publica el contenido de `dist/` tras ejecutar `npm run build` (por ejemplo, con GitHub Actions `actions/upload-pages-artifact`).
- **Vercel / Netlify**: Conecta el repositorio con comando `npm run build` y directorio de salida `dist`.
