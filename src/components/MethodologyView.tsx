export function MethodologyView() {
  return (
    <div className="space-y-6">
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-6">
        <div className="space-y-2 max-w-3xl">
          <h2 className="text-xl font-bold text-[#0F172A]">
            Metodología de Pullbacks sobre SMA 50 y SMA 200
          </h2>
          <p className="text-sm text-[#475569] leading-relaxed">
            El sistema detecta retrocesos técnicos hacia soportes dinámicos institucionales
            (Media Móvil Simple de 50 periodos y Media Móvil Simple de 200 periodos) en tres
            universos completos: IBEX 35, DAX 40 y S&amp;P 500.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
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
        </div>

        <div className="border-t border-[#E2E8F0] pt-5 space-y-4">
          <h3 className="text-sm font-bold text-[#0F172A]">
            Plan de Construcción en 4 Fases
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="border border-[#E2E8F0] bg-white rounded-lg p-4 space-y-1.5">
              <span className="font-semibold text-[#15803D] block">
                Fase 1 · Completada
              </span>
              <p className="font-semibold text-[#0F172A]">
                Estructura GitHub, Datos Maestros e Interfaz
              </p>
              <p className="text-[#475569] leading-relaxed">
                Tipado estricto TypeScript, 580 tickers oficiales e interfaz corporativa modular.
              </p>
            </div>

            <div className="border border-[#E2E8F0] bg-white rounded-lg p-4 space-y-1.5">
              <span className="font-semibold text-[#15803D] block">
                Fase 2 · Completada
              </span>
              <p className="font-semibold text-[#0F172A]">
                Conector Real Yahoo Finance
              </p>
              <p className="text-[#475569] leading-relaxed">
                Descarga asíncrona por lotes con proxies CORS en cascada y cancelación en{' '}
                <span className="font-mono">yahooService.ts</span>.
              </p>
            </div>

            <div className="border border-[#E2E8F0] bg-white rounded-lg p-4 space-y-1.5">
              <span className="font-semibold text-[#15803D] block">
                Fase 3 · Completada
              </span>
              <p className="font-semibold text-[#0F172A]">
                Motor Matemático SMA &amp; Caché Map
              </p>
              <p className="text-[#475569] leading-relaxed">
                Cálculo SMA 50/200 de últimas 15 velas, Modo A/B y caché{' '}
                <span className="font-mono">Map</span> con TTL de 5 min.
              </p>
            </div>

            <div className="border border-[#BFDBFE] bg-[#EFF6FF] rounded-lg p-4 space-y-1.5">
              <span className="font-semibold text-[#1D4ED8] block">
                Fase 4 · Completada
              </span>
              <p className="font-semibold text-[#0F172A]">
                Refinamiento UX, Exportación &amp; GitHub
              </p>
              <p className="text-[#475569] leading-relaxed">
                Micro-barras de distancia, insignias 50/200/Confluencia, TradingView, Excel ES y{' '}
                <span className="font-mono">base: &apos;./&apos;</span>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
