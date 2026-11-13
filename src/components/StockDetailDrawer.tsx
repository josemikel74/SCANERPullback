import { Check, Minus, TrendingDown, TrendingUp, X } from 'lucide-react';
import { MARKETS_METADATA } from '../data/tickersData';
import type { SmaDiagnostics, StockAnalysisResult } from '../types/market';

interface StockDetailDrawerProps {
  stock: StockAnalysisResult | null;
  proximityThresholdPct: number;
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
  symbol,
  proximityThresholdPct,
}: {
  title: string;
  diag: SmaDiagnostics;
  symbol: '€' | '$';
  proximityThresholdPct: number;
}) {
  const withinZone =
    diag.distancePct !== null &&
    Math.abs(diag.distancePct) <= Math.abs(proximityThresholdPct);

  return (
    <div className="border border-[#E2E8F0] rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-[#0F172A]">{title}</h4>
        <span className="font-mono text-xs font-semibold text-[#0F172A] tabular-nums">
          {formatCurrency(diag.smaCurrent, symbol)}
        </span>
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
            detail={
              diag.distancePct !== null
                ? `${diag.distancePct >= 0 ? '+' : ''}${diag.distancePct.toFixed(2)}%`
                : '—'
            }
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
        </div>
      )}
    </div>
  );
}

export function StockDetailDrawer({
  stock,
  proximityThresholdPct,
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
          </div>
          <h3 className="text-lg font-bold text-[#0F172A]">
            <span className="font-mono mr-2">{stock.ticker}</span>
            <span className="font-semibold text-[#334155]">{stock.name}</span>
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar detalle del valor"
          className="p-2 text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-lg transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
          <span className="block text-[11px] font-medium text-[#64748B]">Última vela OHLC</span>
          <span className="block text-xs font-mono text-[#0F172A] tabular-nums">
            O {formatCurrency(stock.open, stock.currencySymbol)} · H{' '}
            {formatCurrency(stock.high, stock.currencySymbol)}
          </span>
          <span className="block text-xs font-mono text-[#475569] tabular-nums">
            L {formatCurrency(stock.low, stock.currencySymbol)} · C{' '}
            {formatCurrency(stock.price, stock.currencySymbol)}
          </span>
        </div>

        <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1">
          <span className="block text-[11px] font-medium text-[#64748B]">Diagnóstico</span>
          <span className="block text-xs font-medium text-[#0F172A] leading-snug">
            {stock.signalSummary}
          </span>
          <span className="block text-[11px] text-[#64748B] font-mono tabular-nums">
            Vol {stock.volumeRatio.toFixed(2)}x · {stock.proxyUsed}
          </span>
        </div>
      </div>

      {/* Auditoría matemática de fórmulas SMA 50 y SMA 200 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <SmaDiagnosticCard
          title="Verificación Matemática SMA 50"
          diag={stock.diagnostics50}
          symbol={stock.currencySymbol}
          proximityThresholdPct={proximityThresholdPct}
        />
        <SmaDiagnosticCard
          title="Verificación Matemática SMA 200"
          diag={stock.diagnostics200}
          symbol={stock.currencySymbol}
          proximityThresholdPct={proximityThresholdPct}
        />
      </div>
    </aside>
  );
}
