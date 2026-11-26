import { Check, Minus, Star, TrendingDown, TrendingUp, X } from 'lucide-react';
import { MARKETS_METADATA } from '../data/tickersData';
import type {
  BacktestSmaSummary,
  SmaDiagnostics,
  StockAnalysisResult,
} from '../types/market';
import { CandlestickChart } from './CandlestickChart';

interface StockDetailDrawerProps {
  stock: StockAnalysisResult | null;
  proximityThresholdPct: number;
  isWatched: boolean;
  onToggleWatchlist: (ticker: string) => void;
  onClose: () => void;
}

function formatCurrency(val: number | null, symbol: '€' | '$'): string {
  if (val === null || !Number.isFinite(val)) return '—';
  const num = val.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol === '€' ? `${num} €` : `$${num}`;
}

function formatSignedPct(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return '—';
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
}

function FormulaCheckRow({
  label,
  passed,
  detail,
}: {
  label: string;
  passed: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#F1F5F9] last:border-b-0">
      <div className="flex items-center gap-1.5 text-[#334155]">
        {passed ? (
          <Check className="w-3.5 h-3.5 text-[#15803D] shrink-0" aria-hidden="true" />
        ) : (
          <Minus className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" aria-hidden="true" />
        )}
        <span className={passed ? 'font-medium text-[#0F172A]' : 'text-[#64748B]'}>
          {label}
        </span>
      </div>
      <span className="font-mono text-[11px] text-[#475569] tabular-nums text-right shrink-0">
        {detail}
      </span>
    </div>
  );
}

function SmaDiagnosticCard({
  title,
  diag,
  atrDist,
  symbol,
  proximityThresholdPct,
  isMacdBullishCross,
}: {
  title: string;
  diag: SmaDiagnostics;
  atrDist: number | null;
  symbol: '€' | '$';
  proximityThresholdPct: number;
  isMacdBullishCross: boolean;
}) {
  const withinZone =
    diag.distancePct !== null &&
    Math.abs(diag.distancePct) <= Math.abs(proximityThresholdPct);

  return (
    <div className="border border-[#E2E8F0] rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-[#0F172A]">{title}</h4>
        <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
          {atrDist !== null && (
            <span className="text-[#64748B]">
              {atrDist >= 0 ? '+' : ''}
              {atrDist.toFixed(2)} ATR
            </span>
          )}
          <span className="font-semibold text-[#0F172A]">
            {formatCurrency(diag.smaCurrent, symbol)}
          </span>
        </div>
      </div>

      {diag.smaCurrent === null ? (
        <p className="text-[11px] text-[#64748B]">
          Velas insuficientes para calcular este periodo.
        </p>
      ) : (
        <div className="text-[11px]">
          <FormulaCheckRow
            label="Pendiente SMA (Actual ≥ hace 10 velas)"
            passed={diag.slopePositiveOrFlat}
            detail={`${formatCurrency(diag.smaCurrent, symbol)} vs ${formatCurrency(diag.sma10Ago, symbol)}`}
          />
          <FormulaCheckRow
            label="Precio sobre SMA hace 5-15 velas"
            passed={diag.wasAboveIn5To15}
            detail={diag.wasAboveIn5To15 ? 'Confirmado' : 'No cumplido'}
          />
          <FormulaCheckRow
            label={`Modo A · Zona (±${proximityThresholdPct.toFixed(1)}%)`}
            passed={withinZone}
            detail={formatSignedPct(diag.distancePct)}
          />
          <FormulaCheckRow
            label="Modo B · Toque (Low ≤ SMA × 1.002)"
            passed={diag.touchedRecently}
            detail={diag.touchedRecently ? 'Tocado' : 'Sin toque'}
          />
          <FormulaCheckRow
            label="Modo B · Rebote (Cierre > SMA)"
            passed={diag.closedStrictlyAbove}
            detail={diag.closedStrictlyAbove ? 'Sobre SMA' : 'Bajo SMA'}
          />
          <FormulaCheckRow
            label="Modo C · Pullback + Cruce MACD ↑"
            passed={
              isMacdBullishCross &&
              (withinZone || (diag.touchedRecently && diag.closedStrictlyAbove)) &&
              diag.wasAboveIn5To15
            }
            detail={isMacdBullishCross ? 'Cruce MACD ↑' : 'Sin cruce MACD'}
          />
        </div>
      )}
    </div>
  );
}

function BacktestSummaryCard({
  title,
  summary,
}: {
  title: string;
  summary: BacktestSmaSummary;
}) {
  return (
    <div className="border border-[#E2E8F0] rounded-lg p-3.5 bg-[#F8FAFC] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#0F172A]">{title}</span>
        <span className="font-mono text-[11px] text-[#475569] tabular-nums">
          {summary.eventsCount} {summary.eventsCount === 1 ? 'rebote' : 'rebotes'}
        </span>
      </div>
      {summary.eventsCount === 0 ? (
        <p className="text-[11px] text-[#64748B]">
          Sin eventos históricos de toque y rebote en la serie descargada.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div className="bg-white border border-[#E2E8F0] rounded p-2 space-y-0.5">
            <span className="block text-[#64748B]">Horizonte +5 velas</span>
            <span className="block font-mono font-semibold text-[#0F172A] tabular-nums">
              Acierto: {summary.winRate5Pct?.toFixed(0)}%
            </span>
            <span
              className={`block font-mono tabular-nums ${
                (summary.avgReturn5Pct ?? 0) >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'
              }`}
            >
              Media: {formatSignedPct(summary.avgReturn5Pct)}
            </span>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded p-2 space-y-0.5">
            <span className="block text-[#64748B]">Horizonte +10 velas</span>
            <span className="block font-mono font-semibold text-[#0F172A] tabular-nums">
              Acierto: {summary.winRate10Pct?.toFixed(0)}%
            </span>
            <span
              className={`block font-mono tabular-nums ${
                (summary.avgReturn10Pct ?? 0) >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'
              }`}
            >
              Media: {formatSignedPct(summary.avgReturn10Pct)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function StockDetailDrawer({
  stock,
  proximityThresholdPct,
  isWatched,
  onToggleWatchlist,
  onClose,
}: StockDetailDrawerProps) {
  if (!stock) {
    return null;
  }

  const meta = MARKETS_METADATA[stock.market];
  const isPositive = stock.changePct >= 0;

  return (
    <aside
      aria-label={`Detalle técnico de ${stock.ticker}`}
      className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-5"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
            <span>{meta.shortLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{stock.sector}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{stock.timeframe}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {stock.validCandlesCount} velas válidas ({stock.candlesCount} brutas)
            </span>
            {stock.isGoldenCross && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#059669]">
                  Golden Cross (SMA 50 &gt; 200)
                </span>
              </>
            )}
          </div>
          <h3 className="text-lg font-bold text-[#0F172A]">
            <span className="font-mono mr-2">{stock.ticker}</span>
            <span className="font-semibold text-[#334155]">{stock.name}</span>
          </h3>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onToggleWatchlist(stock.ticker)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              isWatched
                ? 'bg-[#FEF3C7] border-[#FDE68A] text-[#B45309]'
                : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Star
              className={`w-3.5 h-3.5 ${isWatched ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            <span>{isWatched ? 'En Watchlist' : 'Añadir a Watchlist'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle del valor"
            className="p-2 text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-lg transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Métricas principales + RSI(14) + MACD(12,26,9) + ATR(14) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1">
          <span className="block text-[11px] font-medium text-[#64748B]">Precio actual</span>
          <span className="block text-base font-mono font-semibold text-[#0F172A] tabular-nums">
            {formatCurrency(stock.price, stock.currencySymbol)}
          </span>
        </div>

        <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1">
          <span className="block text-[11px] font-medium text-[#64748B]">Variación periodo</span>
          <span
            className={`inline-flex items-center gap-1 text-base font-mono font-semibold tabular-nums ${
              isPositive ? 'text-[#15803D]' : 'text-[#DC2626]'
            }`}
          >
            {isPositive ? (
              <TrendingUp className="w-4 h-4" aria-hidden="true" />
            ) : (
              <TrendingDown className="w-4 h-4" aria-hidden="true" />
            )}
            {stock.changePct > 0 ? '+' : ''}
            {stock.changePct.toFixed(2).replace('.', ',')}%
          </span>
        </div>

        <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1">
          <span className="block text-[11px] font-medium text-[#64748B]">RSI (14)</span>
          <span className="block text-base font-mono font-semibold text-[#0F172A] tabular-nums">
            {stock.rsi14 !== null ? stock.rsi14.toFixed(1) : '—'}
          </span>
          <span className="block text-[11px] text-[#64748B]">
            {stock.rsi14 === null
              ? 'Sin datos'
              : stock.rsi14 >= 70
                ? 'Sobrecompra'
                : stock.rsi14 <= 30
                  ? 'Sobreventa'
                  : 'Zona neutral'}
          </span>
        </div>

        <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1">
          <span className="block text-[11px] font-medium text-[#64748B]">MACD (12, 26, 9)</span>
          <span
            className={`block text-base font-mono font-semibold tabular-nums ${
              stock.isMacdBullishCross ? 'text-[#059669]' : 'text-[#0F172A]'
            }`}
          >
            {stock.macdLine !== null
              ? `${stock.macdLine >= 0 ? '+' : ''}${stock.macdLine.toFixed(2)}`
              : '—'}
          </span>
          <span className="block text-[11px] text-[#64748B] font-mono tabular-nums">
            {stock.macdSignal !== null
              ? `Señal ${stock.macdSignal.toFixed(2)} · ${
                  stock.isMacdBullishCross
                    ? 'Cruce al alza'
                    : stock.isMacdBullish
                      ? 'Alcista'
                      : 'Bajista'
                }`
              : 'Sin historial'}
          </span>
        </div>

        <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1">
          <span className="block text-[11px] font-medium text-[#64748B]">ATR (14) &amp; Vol.</span>
          <span className="block text-base font-mono font-semibold text-[#0F172A] tabular-nums">
            {formatCurrency(stock.atr14, stock.currencySymbol)}
          </span>
          <span className="block text-[11px] text-[#64748B] font-mono tabular-nums">
            Vol {stock.volumeRatio.toFixed(2)}x · {stock.proxyUsed}
          </span>
        </div>

        <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1">
          <span className="block text-[11px] font-medium text-[#64748B]">Diagnóstico</span>
          <span className="block text-xs font-medium text-[#0F172A] leading-snug">
            {stock.signalSummary}
          </span>
        </div>
      </div>

      {/* Gráfico interactivo OHLC + SMA 50 + SMA 200 */}
      <CandlestickChart
        candles={stock.candles}
        symbol={stock.currencySymbol}
        timeframe={stock.timeframe}
        proximityThresholdPct={proximityThresholdPct}
        matchedSma={stock.matchedSma}
      />

      {/* Auditoría matemática de fórmulas SMA 50 y SMA 200 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <SmaDiagnosticCard
          title="Verificación Matemática SMA 50"
          diag={stock.diagnostics50}
          atrDist={stock.atrDistance50}
          symbol={stock.currencySymbol}
          proximityThresholdPct={proximityThresholdPct}
          isMacdBullishCross={stock.isMacdBullishCross}
        />
        <SmaDiagnosticCard
          title="Verificación Matemática SMA 200"
          diag={stock.diagnostics200}
          atrDist={stock.atrDistance200}
          symbol={stock.currencySymbol}
          proximityThresholdPct={proximityThresholdPct}
          isMacdBullishCross={stock.isMacdBullishCross}
        />
      </div>

      {/* Backtest rápido sobre velas descargadas */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-[#0F172A]">
            Backtest Histórico Rápido (Modo B sobre {stock.backtest.evaluatedBars} velas)
          </h4>
          <span className="text-[11px] text-[#64748B]">
            Calculado en memoria sobre la serie descargada · Enfriamiento 5 velas
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BacktestSummaryCard
            title="Histórico de Rebotes en SMA 50"
            summary={stock.backtest.sma50}
          />
          <BacktestSummaryCard
            title="Histórico de Rebotes en SMA 200"
            summary={stock.backtest.sma200}
          />
        </div>
      </div>
    </aside>
  );
}
