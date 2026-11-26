import { BarChart3, Globe, Play, Square, TrendingUp } from 'lucide-react';
import type {
  ScanStatus,
  StatHorizon,
  StatModelOption,
  StockAnalysisResult,
  Timeframe,
} from '../types/market';
import {
  getStatisticalExpectedReturnPct,
  getStatisticalHorizonStats,
  getStatisticalProbabilityPct,
} from '../utils/indicators';

interface StatisticalAgentPanelProps {
  rows: StockAnalysisResult[];
  allMonitoredCount: number;
  totalPlatformCount: number;
  timeframe: Timeframe;
  scanStatus: ScanStatus;
  isGlobalScanning: boolean;
  globalProcessedCount: number;
  statModel: StatModelOption;
  onStatModelChange: (model: StatModelOption) => void;
  statHorizon: StatHorizon;
  onStatHorizonChange: (horizon: StatHorizon) => void;
  statMinProb: number;
  onStatMinProbChange: (minProb: number) => void;
  statGlobalScope: boolean;
  onToggleStatGlobalScope: (global: boolean) => void;
  onScanAllPlatform: () => void;
  onStopScan: () => void;
  onSelectStock: (stock: StockAnalysisResult) => void;
}

const MODEL_OPTIONS: { id: StatModelOption; label: string; shortDesc: string }[] = [
  {
    id: 'COMPOSITE',
    label: 'Compuesto Bayesiano (%)',
    shortDesc: '45% Bayes empírico + 25% Z-Score + 30% soporte técnico',
  },
  {
    id: 'EMPIRICAL',
    label: 'Bayes Empírico Histórico (%)',
    shortDesc: 'Posterior Beta(2,2) de rebotes históricos similares',
  },
  {
    id: 'ZSCORE',
    label: 'Reversión Z-Score Φ(-Z) (%)',
    shortDesc: 'Probabilidad normal acumulada de retorno a la media de 20 velas',
  },
  {
    id: 'WILSON_95',
    label: 'Cota Conservadora Wilson 95% (%)',
    shortDesc: 'Límite inferior del intervalo de confianza al 95% ajustado por n',
  },
];

const HORIZON_OPTIONS: { id: StatHorizon; label: string }[] = [
  { id: 3, label: '+3 velas' },
  { id: 5, label: '+5 velas' },
  { id: 10, label: '+10 velas' },
];

const MIN_PROB_OPTIONS: number[] = [0, 55, 60, 65, 70, 75];

export function StatisticalAgentPanel({
  rows,
  allMonitoredCount,
  totalPlatformCount,
  timeframe,
  scanStatus,
  isGlobalScanning,
  globalProcessedCount,
  statModel,
  onStatModelChange,
  statHorizon,
  onStatHorizonChange,
  statMinProb,
  onStatMinProbChange,
  statGlobalScope,
  onToggleStatGlobalScope,
  onScanAllPlatform,
  onStopScan,
  onSelectStock,
}: StatisticalAgentPanelProps) {
  const activeModelMeta =
    MODEL_OPTIONS.find((m) => m.id === statModel) ?? MODEL_OPTIONS[0];

  const probs = rows.map((r) =>
    getStatisticalProbabilityPct(r.statisticalBounce, statModel, statHorizon)
  );
  const avgProb =
    probs.length > 0 ? probs.reduce((a, b) => a + b, 0) / probs.length : null;
  const highProbCount = probs.filter((p) => p >= 65).length;

  const expectedReturns = rows
    .map((r) => getStatisticalExpectedReturnPct(r.statisticalBounce, statHorizon))
    .filter((v): v is number => v !== null);
  const avgExpectedReturn =
    expectedReturns.length > 0
      ? expectedReturns.reduce((a, b) => a + b, 0) / expectedReturns.length
      : null;

  const topOpportunities = [...rows]
    .sort(
      (a, b) =>
        getStatisticalProbabilityPct(b.statisticalBounce, statModel, statHorizon) -
        getStatisticalProbabilityPct(a.statisticalBounce, statModel, statHorizon)
    )
    .slice(0, 5);

  const isScanning = scanStatus === 'SCANNING';

  return (
    <section
      aria-label="Modo D: Agente Estadístico y Probabilidades de Rebote"
      className="bg-white border border-[#C7D2FE] rounded-xl overflow-hidden"
    >
      {/* Cabecera ejecutiva */}
      <div className="px-5 py-4 bg-[#EEF2FF]/70 border-b border-[#E2E8F0] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#4338CA]" aria-hidden="true" />
            <h2 className="text-sm font-bold text-[#0F172A]">
              Modo D · Agente Estadístico y Probabilidades de Rebote al Alza
            </h2>
            <span className="font-mono text-[11px] font-semibold text-[#4338CA] tabular-nums">
              {allMonitoredCount} / {totalPlatformCount} acciones monitorizadas ({timeframe})
            </span>
          </div>
          <p className="text-xs text-[#475569]">
            {activeModelMeta.shortDesc} · Resultados expresados en porcentaje (%).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onToggleStatGlobalScope(!statGlobalScope)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
              statGlobalScope
                ? 'bg-white border-[#818CF8] text-[#3730A3]'
                : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {statGlobalScope
                ? 'Alcance: Toda la plataforma en caché'
                : 'Alcance: Solo mercado activo'}
            </span>
          </button>

          {isScanning && isGlobalScanning ? (
            <button
              type="button"
              onClick={onStopScan}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors whitespace-nowrap"
            >
              <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span className="font-mono tabular-nums">
                Detener ({globalProcessedCount}/{totalPlatformCount})
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isScanning}
              onClick={onScanAllPlatform}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>Monitorizar Todas ({totalPlatformCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Selector de opciones probabilísticas en % */}
      <div className="px-5 py-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-[#475569]">
            <span className="font-semibold text-[#0F172A]">Modelo (%):</span>
            <select
              value={statModel}
              onChange={(e) => onStatModelChange(e.target.value as StatModelOption)}
              aria-label="Modelo estadístico de probabilidad"
              className="px-3 py-1.5 text-xs font-semibold bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div
            role="group"
            aria-label="Horizonte estadístico"
            className="inline-flex items-center p-1 bg-white border border-[#E2E8F0] rounded-lg"
          >
            {HORIZON_OPTIONS.map((h) => {
              const active = statHorizon === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onStatHorizonChange(h.id)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE]'
                      : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
                  }`}
                >
                  {h.label}
                </button>
              );
            })}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-[#475569]">
            <span className="font-semibold text-[#0F172A]">Prob. mínima:</span>
            <select
              value={statMinProb}
              onChange={(e) => onStatMinProbChange(Number(e.target.value))}
              aria-label="Probabilidad mínima de rebote en porcentaje"
              className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              {MIN_PROB_OPTIONS.map((pct) => (
                <option key={pct} value={pct}>
                  {pct === 0 ? 'Todas (≥ 0%)' : `≥ ${pct}%`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs font-mono tabular-nums">
          <div>
            <span className="text-[#64748B]">Prob. media: </span>
            <span className="font-bold text-[#0F172A]">
              {avgProb !== null ? `${avgProb.toFixed(1)}%` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[#64748B]">Con prob. ≥ 65%: </span>
            <span className="font-bold text-[#059669]">{highProbCount}</span>
          </div>
          <div>
            <span className="text-[#64748B]">Ret. esp. medio (+{statHorizon}v): </span>
            <span
              className={`font-bold ${
                (avgExpectedReturn ?? 0) >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'
              }`}
            >
              {avgExpectedReturn !== null
                ? `${avgExpectedReturn >= 0 ? '+' : ''}${avgExpectedReturn.toFixed(2)}%`
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Ranking Top 5 de probabilidades en porcentaje */}
      {topOpportunities.length > 0 ? (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-white">
          {topOpportunities.map((stock, idx) => {
            const sb = stock.statisticalBounce;
            const activePct = getStatisticalProbabilityPct(
              sb,
              statModel,
              statHorizon
            );
            const hStats = getStatisticalHorizonStats(sb, statHorizon);

            return (
              <button
                key={stock.ticker}
                type="button"
                onClick={() => onSelectStock(stock)}
                className="text-left p-3.5 rounded-lg border border-[#E2E8F0] hover:border-[#818CF8] hover:bg-[#F8FAFC] transition-colors space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block text-[10px] font-mono text-[#64748B]">
                      #{idx + 1} · {stock.market} · n={hStats.sampleSize}
                    </span>
                    <span className="block font-mono text-xs font-bold text-[#0F172A] truncate">
                      {stock.ticker}
                    </span>
                    <span className="block text-[11px] text-[#64748B] truncate">
                      {stock.name}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-0.5 font-mono text-base font-bold text-[#059669] tabular-nums">
                      <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                      {activePct.toFixed(1)}%
                    </span>
                    <span className="block text-[10px] font-mono text-[#4338CA]">
                      Conf. {sb.confidenceLabel}
                    </span>
                  </div>
                </div>

                {/* Barra de probabilidad */}
                <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#4338CA]"
                    style={{ width: `${Math.min(100, Math.max(4, activePct))}%` }}
                  />
                </div>

                {/* Desglose porcentual de modelos */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-mono tabular-nums text-[#475569]">
                  <span>Bayes: {hStats.bayesianProbPct.toFixed(1)}%</span>
                  <span className="text-right">
                    IC95: {hStats.wilsonLower95Pct.toFixed(1)}%
                  </span>
                  <span>Z-Rev: {sb.zScoreReversionProbPct.toFixed(1)}%</span>
                  <span
                    className={`text-right ${
                      (hStats.avgReturnPct ?? 0) >= 0
                        ? 'text-[#059669]'
                        : 'text-[#DC2626]'
                    }`}
                  >
                    Ret: {hStats.avgReturnPct !== null ? `${hStats.avgReturnPct >= 0 ? '+' : ''}${hStats.avgReturnPct.toFixed(2)}%` : '—'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-4 text-xs text-[#64748B]">
          No hay acciones evaluadas todavía o ninguna supera el umbral mínimo de{' '}
          <span className="font-mono font-semibold text-[#0F172A]">
            {statMinProb}%
          </span>
          . Pulsa <span className="font-semibold text-[#0F172A]">Monitorizar Todas ({totalPlatformCount})</span> o{' '}
          <span className="font-semibold text-[#0F172A]">Iniciar Escaneo</span> para calcular probabilidades en tiempo real.
        </div>
      )}
    </section>
  );
}
