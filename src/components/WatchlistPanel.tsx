import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  LineChart,
  Loader2,
  Minus,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { resolveTickerInfo } from '../data/tickersData';
import {
  DEFAULT_WATCHLIST_TICKERS,
  exportWatchlistJson,
  parseWatchlistImport,
} from '../services/watchlistService';
import type {
  ScanStatus,
  StockAnalysisResult,
  StrategyMode,
  Timeframe,
} from '../types/market';
import { CandlestickChart } from './CandlestickChart';

export interface WatchlistDisplayItem {
  ticker: string;
  name: string;
  sector: string;
  analysis: StockAnalysisResult | null;
}

interface WatchlistPanelProps {
  watchlistTickers: string[];
  items: WatchlistDisplayItem[];
  timeframe: Timeframe;
  strategy: StrategyMode;
  proximityThresholdPct: number;
  scanStatus: ScanStatus;
  activeTicker: string | null;
  loadingTicker: string | null;
  tickerErrors: Record<string, string>;
  isOpen: boolean;
  onToggleOpen: () => void;
  onAddTickers: (tickers: string[]) => void;
  onRemoveTicker: (ticker: string) => void;
  onReplaceWatchlist: (tickers: string[]) => void;
  onScanWatchlist: () => void;
  onInspectTicker: (ticker: string, forceRefresh?: boolean) => void;
  onOpenFullDrawer: (stock: StockAnalysisResult) => void;
}

function toTradingViewSymbol(ticker: string): string {
  if (ticker.endsWith('.MC')) {
    return `BME:${ticker.slice(0, -3)}`;
  }
  if (ticker.endsWith('.DE')) {
    return `XETR:${ticker.slice(0, -3)}`;
  }
  return ticker.replace(/-/g, '.');
}

function formatPrice(value: number | null, symbol: '€' | '$'): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const formatted = value.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol === '€' ? `${formatted} €` : `$${formatted}`;
}

function formatSignedPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function doesItemMatchStrategy(
  analysis: StockAnalysisResult,
  strategy: StrategyMode
): { m50: boolean; m200: boolean } {
  if (strategy === 'BOUNCE') {
    return { m50: analysis.isBounceMatch50, m200: analysis.isBounceMatch200 };
  }
  if (strategy === 'PULLBACK_MACD') {
    return {
      m50: analysis.isMacdPullbackMatch50,
      m200: analysis.isMacdPullbackMatch200,
    };
  }
  return {
    m50: analysis.isProximityMatch50,
    m200: analysis.isProximityMatch200,
  };
}

export function WatchlistPanel({
  watchlistTickers,
  items,
  timeframe,
  strategy,
  proximityThresholdPct,
  scanStatus,
  activeTicker,
  loadingTicker,
  tickerErrors,
  isOpen,
  onToggleOpen,
  onAddTickers,
  onRemoveTicker,
  onReplaceWatchlist,
  onScanWatchlist,
  onInspectTicker,
  onOpenFullDrawer,
}: WatchlistPanelProps) {
  const [tickerInput, setTickerInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedWatchlist, setCopiedWatchlist] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (watchlistTickers.length === 0 && confirmClear) {
      setConfirmClear(false);
    }
  }, [watchlistTickers.length, confirmClear]);

  const isScanning = scanStatus === 'SCANNING';

  const evaluatedCount = items.filter((item) => item.analysis !== null).length;
  const signalCount = items.filter((item) => {
    if (!item.analysis) return false;
    const { m50, m200 } = doesItemMatchStrategy(item.analysis, strategy);
    return m50 || m200;
  }).length;
  const macdCrossCount = items.filter(
    (item) => item.analysis?.isMacdBullishCross === true
  ).length;

  const activeIdx =
    activeTicker !== null
      ? Math.max(
          0,
          items.findIndex((i) => i.ticker === activeTicker)
        )
      : 0;
  const activeItem = items.length > 0 ? items[activeIdx] ?? items[0] : null;
  const isLoadingActive =
    activeItem !== null && loadingTicker === activeItem.ticker;
  const activeError =
    activeItem !== null ? tickerErrors[activeItem.ticker] ?? null : null;

  const handleAddSubmit = () => {
    const trimmed = tickerInput.trim();
    if (!trimmed) {
      setInputError(null);
      return;
    }
    const parsed = parseWatchlistImport(trimmed);
    if (parsed.length === 0) {
      setInputError('Formato no válido. Ejemplo: ITX.MC, SAP.DE, AAPL o BME:SAN.');
      return;
    }
    setInputError(null);
    onAddTickers(parsed);
    setTickerInput('');
  };

  const handleExportJson = () => {
    if (watchlistTickers.length === 0) return;
    const content = exportWatchlistJson(watchlistTickers);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'watchlist_pullbacks.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseWatchlistImport(text);
      if (parsed.length > 0) {
        onReplaceWatchlist(parsed);
        setInputError(null);
      } else {
        setInputError('El archivo seleccionado no contiene tickers válidos.');
      }
    } finally {
      e.target.value = '';
    }
  };

  const handleCopyWatchlistTickers = async () => {
    if (watchlistTickers.length === 0) return;
    const formatted = watchlistTickers.map(toTradingViewSymbol).join(',');
    try {
      await navigator.clipboard.writeText(formatted);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = formatted;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedWatchlist(true);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedWatchlist(false);
    }, 2200);
  };

  const renderPullbackState = (analysis: StockAnalysisResult | null) => {
    if (!analysis) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[#64748B]">
          <Minus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Sin escanear</span>
        </span>
      );
    }

    const { m50, m200 } = doesItemMatchStrategy(analysis, strategy);

    if (!m50 && !m200) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[#64748B]">
          <Minus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Sin señal</span>
        </span>
      );
    }

    const mediaLabel = m50 && m200 ? '50 + 200' : m50 ? 'SMA 50' : 'SMA 200';
    if (strategy === 'BOUNCE') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D]">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Rebote {mediaLabel}</span>
        </span>
      );
    }
    if (strategy === 'PULLBACK_MACD') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#059669]">
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>MACD ↑ {mediaLabel}</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8]">
        <Crosshair className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Zona {mediaLabel}</span>
      </span>
    );
  };

  const handleStepWatchlist = (delta: number) => {
    if (items.length === 0) return;
    const nextIndex = (activeIdx + delta + items.length) % items.length;
    const nextItem = items[nextIndex];
    if (nextItem) {
      onInspectTicker(nextItem.ticker);
    }
  };

  return (
    <section
      aria-label="Ventana Watchlist de seguimiento interactivo"
      className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden"
    >
      {/* Cabecera de la ventana Watchlist */}
      <div className="px-5 py-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2">
            <Star
              className={`w-4 h-4 shrink-0 ${
                watchlistTickers.length > 0
                  ? 'text-[#D97706] fill-[#F59E0B]'
                  : 'text-[#94A3B8]'
              }`}
              aria-hidden="true"
            />
            <h2 className="text-sm font-bold text-[#0F172A] tracking-tight whitespace-nowrap">
              WATCHLIST · Seguimiento Interactivo
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] font-mono tabular-nums">
            <span aria-hidden="true">·</span>
            <span>
              {watchlistTickers.length}{' '}
              {watchlistTickers.length === 1 ? 'acción guardada' : 'acciones guardadas'}
            </span>
            {evaluatedCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{evaluatedCount} con datos</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#1D4ED8] font-semibold">
                  {signalCount} en pullback
                </span>
                {macdCrossCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#059669] font-semibold">
                      {macdCrossCount} cruce MACD ↑
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onScanWatchlist}
            disabled={isScanning || watchlistTickers.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            <span>Escanear Watchlist ({timeframe})</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyWatchlistTickers()}
            disabled={watchlistTickers.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#334155] bg-white border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            {copiedWatchlist ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
                <span className="text-[#15803D]">Copiados</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#475569]" aria-hidden="true" />
                <span>Copiar Tickers</span>
              </>
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt,.csv"
            className="hidden"
            onChange={(e) => void handleImportFile(e)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#334155] bg-white border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5 text-[#475569]" aria-hidden="true" />
            <span>Importar</span>
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            disabled={watchlistTickers.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#334155] bg-white border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[#475569]" aria-hidden="true" />
            <span>Exportar JSON</span>
          </button>

          {watchlistTickers.length > 0 && !confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#64748B] bg-white border border-[#E2E8F0] rounded-lg hover:text-[#DC2626] hover:border-[#FECACA] transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Vaciar</span>
            </button>
          )}

          {confirmClear && (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onReplaceWatchlist([]);
                  setConfirmClear(false);
                }}
                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Confirmar vaciado
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2.5 py-1.5 text-xs font-medium text-[#475569] bg-white border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] transition-colors whitespace-nowrap shrink-0"
              >
                Cancelar
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleOpen}
            aria-expanded={isOpen}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#475569] bg-white border border-[#E2E8F0] rounded-lg hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap shrink-0"
          >
            {isOpen ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Ocultar</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mostrar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isOpen && (
        <>
          {/* Barra rápida para añadir tickers manualmente */}
          <div className="px-5 py-3 border-b border-[#E2E8F0] bg-white space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => {
                  setTickerInput(e.target.value);
                  if (inputError) setInputError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubmit();
                  }
                }}
                placeholder="Añadir acciones a Watchlist (ej. ITX.MC, SAP.DE, AAPL, BME:SAN)..."
                aria-label="Añadir acciones a Watchlist"
                className="flex-1 min-w-[260px] px-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
              />
              <button
                type="button"
                onClick={handleAddSubmit}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Añadir a Watchlist</span>
              </button>
              <span className="text-[11px] text-[#64748B]">
                Haz clic en cualquier fila para cargar y visualizar su gráfico e indicadores en tiempo real.
              </span>
            </div>
            {inputError && (
              <p className="text-xs text-[#DC2626] font-medium">{inputError}</p>
            )}
          </div>

          {/* Contenido de la Watchlist */}
          {items.length === 0 ? (
            <div className="py-10 px-6 text-center space-y-2.5">
              <p className="text-sm font-semibold text-[#0F172A]">
                No tienes acciones guardadas en tu Watchlist
              </p>
              <p className="text-xs text-[#64748B] max-w-lg mx-auto">
                Pulsa la estrella ★ junto a cualquier valor de la tabla de resultados o añade tickers
                manualmente arriba para hacer su seguimiento continuo en esta ventana.
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onReplaceWatchlist(DEFAULT_WATCHLIST_TICKERS)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    Restaurar selección inicial ({DEFAULT_WATCHLIST_TICKERS.length} valores)
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold text-[#475569]">
                      <th className="py-2.5 pl-5 pr-3 whitespace-nowrap">
                        Ticker / Compañía
                      </th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Sector</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Precio</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Var. %</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">
                        Dist. SMA 50
                      </th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">
                        Dist. SMA 200
                      </th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">MACD</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">RSI 14</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Seguimiento</th>
                      <th className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-xs">
                    {items.map((item) => {
                      const a = item.analysis;
                      const resolved = resolveTickerInfo(item.ticker);
                      const isRowActive = activeItem?.ticker === item.ticker;
                      const isRowLoading = loadingTicker === item.ticker;
                      const absThreshold = Math.max(0.1, Math.abs(proximityThresholdPct));

                      const getDistColor = (d: number | null) => {
                        if (d === null) return 'text-[#94A3B8]';
                        if (Math.abs(d) <= absThreshold) {
                          return d >= 0
                            ? 'text-[#059669] font-semibold'
                            : 'text-[#D97706] font-semibold';
                        }
                        return 'text-[#475569]';
                      };

                      return (
                        <tr
                          key={item.ticker}
                          onClick={() => onInspectTicker(item.ticker)}
                          className={`h-[44px] cursor-pointer transition-colors duration-100 ${
                            isRowActive ? 'bg-[#EFF6FF]' : 'hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <td className="py-2 pl-5 pr-3 max-w-[260px]">
                            <div className="flex items-center gap-2 truncate">
                              <a
                                href={`https://finance.yahoo.com/quote/${encodeURIComponent(item.ticker)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title={`Abrir ${item.ticker} en Yahoo Finance`}
                                className="inline-flex items-center gap-1 font-mono font-semibold text-[#0F172A] hover:text-[#1D4ED8] hover:underline shrink-0"
                              >
                                <span>{item.ticker}</span>
                                <ExternalLink
                                  className="w-3 h-3 text-[#94A3B8]"
                                  aria-hidden="true"
                                />
                              </a>
                              <span className="text-[#64748B] truncate">
                                {item.name || resolved.name}
                              </span>
                              {a && (
                                <span className="text-[11px] font-mono text-[#94A3B8] shrink-0">
                                  {a.timeframe}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-[#475569] whitespace-nowrap">
                            {item.sector || resolved.sector}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-medium text-[#0F172A] tabular-nums whitespace-nowrap">
                            {a ? formatPrice(a.price, a.currencySymbol) : '—'}
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-mono font-medium tabular-nums whitespace-nowrap ${
                              !a
                                ? 'text-[#94A3B8]'
                                : a.changePct >= 0
                                  ? 'text-[#059669]'
                                  : 'text-[#DC2626]'
                            }`}
                          >
                            {a ? formatSignedPct(a.changePct) : '—'}
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap ${getDistColor(
                              a?.distanceSma50Pct ?? null
                            )}`}
                          >
                            {a ? formatSignedPct(a.distanceSma50Pct) : '—'}
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap ${getDistColor(
                              a?.distanceSma200Pct ?? null
                            )}`}
                          >
                            {a ? formatSignedPct(a.distanceSma200Pct) : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {a && a.macdLine !== null && a.macdSignal !== null ? (
                              <span
                                className={`inline-flex items-center justify-end gap-1 ${
                                  a.isMacdBullishCross
                                    ? 'text-[#059669] font-semibold'
                                    : a.isMacdBullish
                                      ? 'text-[#1D4ED8]'
                                      : 'text-[#64748B]'
                                }`}
                              >
                                {a.isMacdBullishCross && (
                                  <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                                )}
                                <span>
                                  {a.macdLine >= 0 ? '+' : ''}
                                  {a.macdLine.toFixed(2)}
                                </span>
                                <span className="text-[10px]">
                                  {a.isMacdBullishCross
                                    ? 'Cruce ↑'
                                    : a.isMacdBullish
                                      ? 'Alc.'
                                      : 'Baj.'}
                                </span>
                              </span>
                            ) : (
                              <span className="text-[#94A3B8]">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[#334155] tabular-nums whitespace-nowrap">
                            {a && a.rsi14 !== null ? a.rsi14.toFixed(1) : '—'}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            {renderPullbackState(a)}
                          </td>
                          <td className="py-2 pl-3 pr-5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onInspectTicker(item.ticker);
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                                  isRowActive
                                    ? 'bg-[#1D4ED8] border-[#1D4ED8] text-white'
                                    : 'bg-white border-[#E2E8F0] text-[#334155] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
                                }`}
                              >
                                {isRowLoading ? (
                                  <Loader2
                                    className="w-3 h-3 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <LineChart className="w-3 h-3" aria-hidden="true" />
                                )}
                                <span>{isRowActive ? 'En visor' : 'Gráfico'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveTicker(item.ticker);
                                }}
                                aria-label={`Quitar ${item.ticker} de Watchlist`}
                                title={`Quitar ${item.ticker} de Watchlist`}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded transition-colors"
                              >
                                <X className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Quitar</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Visor interactivo en tiempo real de la acción seleccionada del Watchlist */}
              {activeItem && (
                <div className="border-t border-[#E2E8F0] bg-[#F8FAFC] p-5 space-y-4">
                  {/* Cabecera del visor interactivo */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                        <span className="font-semibold text-[#0F172A]">
                          Visor Watchlist en Tiempo Real
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{activeItem.sector}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">
                          {activeItem.analysis?.timeframe ?? timeframe}
                        </span>
                        {activeItem.analysis && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              Actualizado {activeItem.analysis.lastUpdated} ({activeItem.analysis.proxyUsed})
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-[#0F172A]">
                        <span className="font-mono mr-2">{activeItem.ticker}</span>
                        <span className="font-semibold text-[#334155]">
                          {activeItem.name}
                        </span>
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <div className="inline-flex items-center bg-white border border-[#E2E8F0] rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => handleStepWatchlist(-1)}
                          disabled={items.length <= 1}
                          aria-label="Acción anterior del Watchlist"
                          className="p-1.5 text-[#475569] hover:text-[#0F172A] disabled:opacity-40 rounded"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <span className="px-2 text-[11px] font-mono tabular-nums text-[#475569]">
                          {activeIdx + 1} / {items.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStepWatchlist(1)}
                          disabled={items.length <= 1}
                          aria-label="Siguiente acción del Watchlist"
                          className="p-1.5 text-[#475569] hover:text-[#0F172A] disabled:opacity-40 rounded"
                        >
                          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onInspectTicker(activeItem.ticker, true)}
                        disabled={isLoadingActive}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0F172A] bg-white border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isLoadingActive ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        <span>
                          {activeItem.analysis
                            ? 'Actualizar tiempo real'
                            : 'Cargar gráfico en tiempo real'}
                        </span>
                      </button>

                      {activeItem.analysis && (
                        <button
                          type="button"
                          onClick={() => {
                            if (activeItem.analysis) {
                              onOpenFullDrawer(activeItem.analysis);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg hover:bg-[#DBEAFE] transition-colors whitespace-nowrap shrink-0"
                        >
                          <span>Auditoría y Backtest</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tira de indicadores en vivo de la acción seleccionada */}
                  {activeItem.analysis && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 bg-white border border-[#E2E8F0] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0]">
                      <div className="p-3 space-y-0.5">
                        <span className="block text-[11px] font-medium text-[#64748B]">
                          Precio y Var. %
                        </span>
                        <span className="block text-sm font-mono font-semibold text-[#0F172A] tabular-nums">
                          {formatPrice(
                            activeItem.analysis.price,
                            activeItem.analysis.currencySymbol
                          )}
                        </span>
                        <span
                          className={`block text-[11px] font-mono tabular-nums ${
                            activeItem.analysis.changePct >= 0
                              ? 'text-[#059669]'
                              : 'text-[#DC2626]'
                          }`}
                        >
                          {formatSignedPct(activeItem.analysis.changePct)}
                        </span>
                      </div>

                      <div className="p-3 space-y-0.5">
                        <span className="block text-[11px] font-medium text-[#64748B]">
                          SMA 50
                        </span>
                        <span className="block text-sm font-mono font-semibold text-[#1D4ED8] tabular-nums">
                          {formatPrice(
                            activeItem.analysis.sma50,
                            activeItem.analysis.currencySymbol
                          )}
                        </span>
                        <span className="block text-[11px] font-mono text-[#475569] tabular-nums">
                          Dist. {formatSignedPct(activeItem.analysis.distanceSma50Pct)}
                        </span>
                      </div>

                      <div className="p-3 space-y-0.5">
                        <span className="block text-[11px] font-medium text-[#64748B]">
                          SMA 200
                        </span>
                        <span className="block text-sm font-mono font-semibold text-[#4338CA] tabular-nums">
                          {formatPrice(
                            activeItem.analysis.sma200,
                            activeItem.analysis.currencySymbol
                          )}
                        </span>
                        <span className="block text-[11px] font-mono text-[#475569] tabular-nums">
                          Dist. {formatSignedPct(activeItem.analysis.distanceSma200Pct)}
                        </span>
                      </div>

                      <div className="p-3 space-y-0.5">
                        <span className="block text-[11px] font-medium text-[#64748B]">
                          MACD (12, 26, 9)
                        </span>
                        <span
                          className={`block text-sm font-mono font-semibold tabular-nums ${
                            activeItem.analysis.isMacdBullishCross
                              ? 'text-[#059669]'
                              : 'text-[#0F172A]'
                          }`}
                        >
                          {activeItem.analysis.macdLine !== null
                            ? `${activeItem.analysis.macdLine >= 0 ? '+' : ''}${activeItem.analysis.macdLine.toFixed(2)}`
                            : '—'}
                        </span>
                        <span className="block text-[11px] font-mono text-[#475569] tabular-nums">
                          {activeItem.analysis.macdSignal !== null
                            ? `Señal ${activeItem.analysis.macdSignal.toFixed(2)} · ${
                                activeItem.analysis.isMacdBullishCross
                                  ? 'Cruce ↑'
                                  : activeItem.analysis.isMacdBullish
                                    ? 'Alcista'
                                    : 'Bajista'
                              }`
                            : 'Sin historial'}
                        </span>
                      </div>

                      <div className="p-3 space-y-0.5">
                        <span className="block text-[11px] font-medium text-[#64748B]">
                          RSI (14) &amp; Vol.
                        </span>
                        <span className="block text-sm font-mono font-semibold text-[#0F172A] tabular-nums">
                          {activeItem.analysis.rsi14 !== null
                            ? activeItem.analysis.rsi14.toFixed(1)
                            : '—'}
                        </span>
                        <span className="block text-[11px] font-mono text-[#475569] tabular-nums">
                          Vol {activeItem.analysis.volumeRatio.toFixed(2)}x · ATR{' '}
                          {formatPrice(
                            activeItem.analysis.atr14,
                            activeItem.analysis.currencySymbol
                          )}
                        </span>
                      </div>

                      <div className="p-3 space-y-0.5">
                        <span className="block text-[11px] font-medium text-[#64748B]">
                          Señal Pullback
                        </span>
                        <div className="pt-0.5">
                          {renderPullbackState(activeItem.analysis)}
                        </div>
                        <span className="block text-[11px] text-[#64748B] truncate">
                          {activeItem.analysis.isGoldenCross
                            ? 'Golden Cross (50 > 200)'
                            : 'Sin Golden Cross'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Estado de carga / error / gráfico OHLC + MACD en tiempo real */}
                  {isLoadingActive ? (
                    <div className="border border-[#E2E8F0] rounded-lg bg-white p-10 flex flex-col items-center justify-center gap-2 text-xs text-[#475569]">
                      <Loader2
                        className="w-5 h-5 text-[#1D4ED8] animate-spin"
                        aria-hidden="true"
                      />
                      <span>
                        Descargando velas OHLC e indicadores en tiempo real para{' '}
                        <strong className="font-mono text-[#0F172A]">
                          {activeItem.ticker}
                        </strong>
                        ...
                      </span>
                    </div>
                  ) : activeError ? (
                    <div className="border border-[#FECACA] rounded-lg bg-white p-6 text-center space-y-2.5">
                      <p className="text-xs font-semibold text-[#DC2626]">
                        No se pudieron cargar los datos en tiempo real de {activeItem.ticker}:{' '}
                        {activeError}
                      </p>
                      <button
                        type="button"
                        onClick={() => onInspectTicker(activeItem.ticker, true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Reintentar descarga</span>
                      </button>
                    </div>
                  ) : activeItem.analysis ? (
                    <CandlestickChart
                      key={`${activeItem.ticker}-${activeItem.analysis.timeframe}`}
                      candles={activeItem.analysis.candles}
                      symbol={activeItem.analysis.currencySymbol}
                      timeframe={activeItem.analysis.timeframe}
                      proximityThresholdPct={proximityThresholdPct}
                      matchedSma={activeItem.analysis.matchedSma}
                    />
                  ) : (
                    <div className="border border-[#E2E8F0] rounded-lg bg-white p-8 text-center space-y-2.5">
                      <p className="text-xs font-semibold text-[#0F172A]">
                        Gráfico en tiempo real disponible para {activeItem.ticker}
                      </p>
                      <p className="text-xs text-[#64748B] max-w-md mx-auto">
                        Pulsa para descargar al instante las velas OHLC, SMA 50/200, MACD (12, 26, 9),
                        RSI (14) y ATR (14) de este valor, o haz clic en «Escanear Watchlist».
                      </p>
                      <div>
                        <button
                          type="button"
                          onClick={() => onInspectTicker(activeItem.ticker, true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors"
                        >
                          <LineChart className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Cargar gráfico en tiempo real</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
