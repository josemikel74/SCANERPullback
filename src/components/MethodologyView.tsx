export function MethodologyView() {
  return (
    <div className="space-y-6">
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6">
        <div className="space-y-2 max-w-3xl">
          <h2 className="text-xl font-bold text-[#0F172A]">
            Metodología Cuantitativa de Pullbacks sobre SMA 50 y SMA 200
          </h2>
          <p className="text-sm text-[#475569] leading-relaxed">
            El sistema detecta retrocesos técnicos hacia soportes dinámicos institucionales
            (Media Móvil Simple de 50 periodos y Media Móvil Simple de 200 periodos) sobre
            un repositorio unificado (<span className="font-mono">data/tickers.json</span>)
            con 580 activos oficiales (IBEX 35, DAX 40, S&amp;P 500), Europa Combinado y
            Watchlist personalizada.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div className="border border-[#E2E8F0] rounded-xl p-5 space-y-2.5 bg-[#F8FAFC]">
            <h3 className="text-sm font-bold text-[#0F172A]">
              Modo A · Zona de Proximidad (±%)
            </h3>
            <p className="text-xs text-[#475569] leading-relaxed">
              Exige tendencia positiva o neutra-alcista (<span className="font-mono">SMA actual ≥ SMA hace 10 velas</span>),
              que el precio cotizase por encima de la media hace 5–15 velas y que la distancia actual{' '}
              (<span className="font-mono">((Cierre - SMA) / SMA) × 100</span>) esté dentro de{' '}
              <span className="font-mono tabular-nums">[-umbral%, +umbral%]</span> (por defecto{' '}
              <span className="font-mono tabular-nums">±1,5%</span>).
            </p>
          </div>

          <div className="border border-[#E2E8F0] rounded-xl p-5 space-y-2.5 bg-[#F8FAFC]">
            <h3 className="text-sm font-bold text-[#0F172A]">
              Modo B · Toque y Rebote Estricto
            </h3>
            <p className="text-xs text-[#475569] leading-relaxed">
              Exige que el mínimo de la vela actual o inmediatamente anterior haya tocado o perforado la
              referencia (<span className="font-mono">Low ≤ SMA × 1.002</span>) viniendo de cotizar por
              encima hace 5–15 velas, y que el cierre actual recupere estrictamente por encima de la media
              (<span className="font-mono">Cierre &gt; SMA</span>).
            </p>
          </div>

          <div className="border border-[#A7F3D0] rounded-xl p-5 space-y-2.5 bg-[#ECFDF5]/60">
            <h3 className="text-sm font-bold text-[#0F172A]">
              Modo C · Pullback + Cruce MACD ↑
            </h3>
            <p className="text-xs text-[#475569] leading-relaxed">
              Combina la detección de pullback en SMA 50/200 (Modo A o Modo B) con la confirmación de giro
              alcista en <span className="font-mono">MACD (12, 26, 9)</span>:{' '}
              <span className="font-mono">MACD<sub>t-1</sub> ≤ Señal<sub>t-1</sub></span> y{' '}
              <span className="font-mono">MACD<sub>t</sub> &gt; Señal<sub>t</sub></span>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="border border-[#E2E8F0] rounded-xl p-4 space-y-1.5">
            <h4 className="text-xs font-bold text-[#0F172A]">RSI (14), MACD (12,26,9) &amp; Golden Cross</h4>
            <p className="text-xs text-[#475569] leading-relaxed">
              Calcula el RSI suavizado de Wilder (14), el oscilador{' '}
              <span className="font-mono">MACD = EMA(12) - EMA(26)</span> con línea señal{' '}
              <span className="font-mono">EMA(9)</span> (detectando cruces al alza{' '}
              <span className="font-mono">MACD<sub>t-1</sub> ≤ Señal<sub>t-1</sub></span> y{' '}
              <span className="font-mono">MACD<sub>t</sub> &gt; Señal<sub>t</sub></span>) y{' '}
              <span className="font-mono">SMA 50 &gt; SMA 200</span>.
            </p>
          </div>

          <div className="border border-[#E2E8F0] rounded-xl p-4 space-y-1.5">
            <h4 className="text-xs font-bold text-[#0F172A]">Distancia Normalizada ATR (14)</h4>
            <p className="text-xs text-[#475569] leading-relaxed">
              Mide <span className="font-mono">(Cierre - SMA) / ATR(14)</span> para comparar de
              forma homogénea valores defensivos de baja volatilidad frente a valores tecnológicos.
            </p>
          </div>

          <div className="border border-[#E2E8F0] rounded-xl p-4 space-y-1.5">
            <h4 className="text-xs font-bold text-[#0F172A]">Backtest Rápido Histórico</h4>
            <p className="text-xs text-[#475569] leading-relaxed">
              Evalúa sobre la propia serie descargada (2 años diarios o 5 años semanales) cuántos
              rebotes previos cumplió la acción en SMA 50/200 y su rentabilidad media a +5 y +10 velas.
            </p>
          </div>
        </div>

        <div className="border-t border-[#E2E8F0] pt-5 space-y-4">
          <h3 className="text-sm font-bold text-[#0F172A]">
            Arquitectura Dual &amp; Calidad Continua (GitHub CI/CD)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="border border-[#E2E8F0] bg-white rounded-lg p-4 space-y-1.5">
              <span className="font-semibold text-[#15803D] block">
                SSOT · data/tickers.json
              </span>
              <p className="font-semibold text-[#0F172A]">
                Fuente Única de Verdad
              </p>
              <p className="text-[#475569] leading-relaxed">
                Los 580 tickers oficiales son compartidos por TypeScript y Python sin duplicidad.
              </p>
            </div>

            <div className="border border-[#E2E8F0] bg-white rounded-lg p-4 space-y-1.5">
              <span className="font-semibold text-[#15803D] block">
                Frontend Estático
              </span>
              <p className="font-semibold text-[#0F172A]">
                Vite + React + Chart OHLC
              </p>
              <p className="text-[#475569] leading-relaxed">
                Gráfico SVG interactivo, Watchlist en <span className="font-mono">localStorage</span>{' '}
                y <span className="font-mono">base: &apos;./&apos;</span>.
              </p>
            </div>

            <div className="border border-[#E2E8F0] bg-white rounded-lg p-4 space-y-1.5">
              <span className="font-semibold text-[#15803D] block">
                Backend Streamlit
              </span>
              <p className="font-semibold text-[#0F172A]">
                app.py + yf.download
              </p>
              <p className="text-[#475569] leading-relaxed">
                Descarga vectorizada por bloques + respaldo <span className="font-mono">query1/query2</span>{' '}
                y gráfico Plotly.
              </p>
            </div>

            <div className="border border-[#BFDBFE] bg-[#EFF6FF] rounded-lg p-4 space-y-1.5">
              <span className="font-semibold text-[#1D4ED8] block">
                GitHub Actions CI
              </span>
              <p className="font-semibold text-[#0F172A]">
                Validación Automática
              </p>
              <p className="text-[#475569] leading-relaxed">
                Verifica <span className="font-mono">tsc --noEmit</span>,{' '}
                <span className="font-mono">npm run build</span>, paridad matemática y{' '}
                <span className="font-mono">py_compile</span>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
