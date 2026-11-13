import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  Minus,
  Play,
  RotateCcw,
} from 'lucide-react';
import type {
  MarketId,
  ScanStatus,
  SmaFilter,
  SortColumn,
  SortDirection,
  StockAnalysisResult,
  StrategyMode,
  Timeframe,
} from '../types/market';

interface ResultsTableProps {
  rows: StockAnalysisResult[];
  market: MarketId;
  timeframe: Timeframe;
  totalMarketTickers: number;
  scannedCount: number;
  incidentCount: number;
  fromCache: boolean;
  recalcMs: number;
  scanStatus: ScanStatus;
  strategy: StrategyMode;
  proximityThresholdPct: number;
  smaFilter: SmaFilter;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  onSelectStock: (stock: StockAnalysisResult) => void;
  selectedTicker: string | null;
  onResetFilters: () => void;
  onStartScan: () => void;
  onExportCsv: () => void;
  onCopyTickers: () => void;
  copiedCount: number | null;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
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
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Celda enriquecida para Distancia Porcentual:
 * - Porcentaje exacto con signo y 2 decimales (+0.38% en verde esmeralda, -0.45% en ámbar dentro de la banda)
 * - Micro-barra visual centrada en 0.00%
 */
function DistanceCell({
  distancePct,
  thresholdPct,
}: {
  distancePct: number | null;
  thresholdPct: number;
}) {
  if (distancePct === null || !Number.isFinite(distancePct)) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono text-xs text-[#94A3B8] tabular-nums">—</span>
      </div>
    );
  }

  const absThreshold = Math.max(0.1, Math.abs(thresholdPct));
  const insideBand = Math.abs(distancePct) <= absThreshold;
  const isAbove = distancePct >= 0;

  let textColor = 'text-[#475569]';
  let barColor = 'bg-[#94A3B8]';

  if (insideBand) {
    if (isAbove) {
      textColor = 'text-[#059669] font-semibold';
      barColor = 'bg-[#10B981]';
    } else {
      textColor = 'text-[#D97706] font-semibold';
      barColor = 'bg-[#F59E0B]';
    }
  } else if (isAbove) {
    barColor = 'bg-[#94A3B8]';
  } else {
    barColor = 'bg-[#CBD5E1]';
  }

  // Escala visual simétrica centrada en 0.00% (rango ±max(5%, umbral*2))
  const scaleMax = Math.max(5, absThreshold * 2);
  const clampedRatio = Math.min(1, Math.abs(distancePct) / scaleMax);
  const halfBarPct = Math.max(4, Math.round(clampedRatio * 50));

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <span className={`font-mono text-xs tabular-nums whitespace-nowrap ${textColor}`}>
        {formatSignedPct(distancePct)}
      </span>
      <div
        aria-hidden="true"
        className="relative w-20 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden"
      >
        {/* Marca central 0.00% */}
        <span className="absolute left-1/2 top-0 bottom-0 w-px bg-[#64748B] z-10 -translate-x-1/2" />
        {/* Relleno desde 0.00% hacia derecha (+) o izquierda (-) */}
        {isAbove ? (
          <span
            className={`absolute top-0 bottom-0 left-1/2 rounded-r-full ${barColor}`}
            style={{ width: `${halfBarPct}%` }}
          />
        ) : (
          <span
            className={`absolute top-0 bottom-0 rounded-l-full ${barColor}`}
            style={{
              left: `${50 - halfBarPct}%`,
              width: `${halfBarPct}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Insignia diferenciada de Media Móvil Objetivo:
 * - SMA 50 (azul)
 * - SMA 200 (índigo/morado)
 * - Confluencia 50 + 200 (dorado)
 */
function SmaBadge({
  match50,
  match200,
}: {
  match50: boolean;
  match200: boolean;
}) {
  if (match50 && match200) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A] whitespace-nowrap">
        Confluencia 50 + 200
      </span>
    );
  }
  if (match50) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] whitespace-nowrap">
        SMA 50
      </span>
    );
  }
  if (match200) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EEF2FF] text-[#4338CA] border border-[#C7D2FE] whitespace-nowrap">
        SMA 200
      </span>
    );
  }
  return <span className="text-[11px] text-[#94A3B8]">—</span>;
}

export function ResultsTable({
  rows,
  market,
  timeframe,
  totalMarketTickers,
  scannedCount,
  incidentCount,
  fromCache,
  recalcMs,
  scanStatus,
  strategy,
  proximityThresholdPct,
  smaFilter,
  sortColumn,
  sortDirection,
  onSort,
  onSelectStock,
  selectedTicker,
  onResetFilters,
  onStartScan,
  onExportCsv,
  onCopyTickers,
  copiedCount,
  currentPage,
  pageSize,
  onPageChange,
}: ResultsTableProps) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paginatedRows = rows.slice(startIdx, startIdx + pageSize);

  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-[#94A3B8]" aria-hidden="true" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#1D4ED8]" aria-hidden="true" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#1D4ED8]" aria-hidden="true" />
    );
  };

  const getActiveSmaMatches = (row: StockAnalysisResult) => {
    if (strategy === 'BOUNCE') {
      return {
        m50: (smaFilter === 'ALL' || smaFilter === 'SMA50') && row.isBounceMatch50,
        m200: (smaFilter === 'ALL' || smaFilter === 'SMA200') && row.isBounceMatch200,
      };
    }
    return {
      m50: (smaFilter === 'ALL' || smaFilter === 'SMA50') && row.isProximityMatch50,
      m200: (smaFilter === 'ALL' || smaFilter === 'SMA200') && row.isProximityMatch200,
    };
  };

  const renderSignalCell = (row: StockAnalysisResult) => {
    const { m50, m200 } = getActiveSmaMatches(row);
    const hasMatch = m50 || m200;

    if (!hasMatch) {
      return (
        <div className="inline-flex items-center gap-1.5 text-xs text-[#64748B]">
          <Minus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Sin señal</span>
        </div>
      );
    }

    if (strategy === 'BOUNCE') {
      return (
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Toque y Rebote</span>
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1D4ED8]">
        <Crosshair className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>En Zona</span>
      </div>
    );
  };

  const isScanningInitial = scanStatus === 'SCANNING' && scannedCount === 0;
  const progressPct = Math.min(
    100,
    Math.round((scannedCount / Math.max(1, totalMarketTickers)) * 100)
  );

  return (
    <section
      aria-label="Tabla de resultados del escáner"
      className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden"
    >
      {/* Cabecera contextual, telemetría y exportación */}
      <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 bg-[#F8FAFC]">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#475569]">
          <span className="font-semibold text-[#0F172A]">
            {scanStatus === 'SCANNING'
              ? `Analizando ${scannedCount} de ${totalMarketTickers} acciones...`
              : 'Resultados del rastreo'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {rows.length} {rows.length === 1 ? 'valor mostrado' : 'valores mostrados'}
          </span>
          {scanStatus !== 'SCANNING' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                Analizadas {scannedCount} de {totalMarketTickers}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>
            {strategy === 'PROXIMITY'
              ? `Proximidad ±${proximityThresholdPct.toFixed(1)}%`
              : 'Toque y Rebote Estricto'}
          </span>
          {scannedCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[#64748B]">
                {fromCache ? 'Caché 5 min' : 'En memoria'} ({recalcMs.toFixed(1)} ms)
              </span>
            </>
          )}
          {incidentCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[#B45309]">
                Incidencias: {incidentCount}
              </span>
            </>
          )}
        </div>

        {/* Acciones de exportación y ordenación rápida */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSort('minSmaDistance')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              sortColumn === 'minSmaDistance'
                ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
                : 'bg-white border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <span>Menor dist. SMA</span>
            {renderSortIcon('minSmaDistance')}
          </button>

          <button
            type="button"
            onClick={onCopyTickers}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0F172A] bg-white border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {copiedCount !== null ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
                <span className="text-[#15803D]">
                  Copiados {copiedCount} (TradingView)
                </span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#475569]" aria-hidden="true" />
                <span>Copiar Tickers</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0F172A] bg-white border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#475569]" aria-hidden="true" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Barra de progreso en tiempo real */}
      {scanStatus === 'SCANNING' && (
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de descarga del mercado"
          className="w-full h-1.5 bg-[#E2E8F0] overflow-hidden"
        >
          <div
            className="h-full bg-[#1D4ED8] transition-all duration-150"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Estado de carga inicial */}
      {isScanningInitial ? (
        <div className="divide-y divide-[#E2E8F0]">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="px-5 py-3 flex items-center justify-between gap-4 animate-pulse"
            >
              <div className="h-4 w-36 bg-[#E2E8F0] rounded" />
              <div className="h-4 w-24 bg-[#F1F5F9] rounded" />
              <div className="h-4 w-20 bg-[#E2E8F0] rounded" />
              <div className="h-4 w-20 bg-[#F1F5F9] rounded" />
              <div className="h-4 w-28 bg-[#E2E8F0] rounded" />
            </div>
          ))}
        </div>
      ) : scanStatus === 'IDLE' && scannedCount === 0 ? (
        <div className="py-16 px-6 text-center space-y-3">
          <p className="text-sm font-semibold text-[#0F172A]">
            Escáner en tiempo real listo para {market} ({timeframe})
          </p>
          <p className="text-xs text-[#64748B] max-w-lg mx-auto">
            Pulsa iniciar para descargar las series históricas OHLC reales desde Yahoo Finance
            y evaluar pullbacks sobre SMA 50 y SMA 200.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onStartScan}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1D4ED8] rounded-lg hover:bg-[#1E40AF] transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>Iniciar Escaneo Ahora</span>
            </button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 px-6 text-center space-y-3">
          <p className="text-sm font-semibold text-[#0F172A]">
            {scanStatus === 'SCANNING'
              ? `Analizando ${scannedCount} de ${totalMarketTickers} acciones... sin coincidencias aún`
              : 'Ningún valor coincide con los criterios seleccionados'}
          </p>
          <p className="text-xs text-[#64748B] max-w-md mx-auto">
            Puedes ampliar el rango de proximidad en el Modo A, activar «Mostrando todo el
            índice» para inspeccionar todas las cotizaciones o restablecer los filtros.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Restablecer filtros</span>
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
                    <button
                      type="button"
                      onClick={() => onSort('ticker')}
                      className="inline-flex items-center gap-1.5 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                    >
                      <span>Ticker / Compañía</span>
                      {renderSortIcon('ticker')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Sector</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSort('price')}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                    >
                      <span>Precio</span>
                      {renderSortIcon('price')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSort('changePct')}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                    >
                      <span>Var. %</span>
                      {renderSortIcon('changePct')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">SMA 50</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSort('distanceSma50Pct')}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                    >
                      <span>Dist. SMA 50</span>
                      {renderSortIcon('distanceSma50Pct')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">SMA 200</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSort('distanceSma200Pct')}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                    >
                      <span>Dist. SMA 200</span>
                      {renderSortIcon('distanceSma200Pct')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSort('volumeRatio')}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                    >
                      <span>Vol. Rel.</span>
                      {renderSortIcon('volumeRatio')}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Media</th>
                  <th className="py-2.5 pl-3 pr-5 whitespace-nowrap">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs">
                {paginatedRows.map((row) => {
                  const isSelected = selectedTicker === row.ticker;
                  const isPositive = row.changePct >= 0;
                  const { m50, m200 } = getActiveSmaMatches(row);

                  return (
                    <tr
                      key={row.ticker}
                      onClick={() => onSelectStock(row)}
                      className={`h-[48px] cursor-pointer transition-colors duration-100 ${
                        isSelected ? 'bg-[#EFF6FF]' : 'hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <td className="py-2 pl-5 pr-3 max-w-[250px]">
                        <div className="flex items-center gap-2 truncate">
                          <a
                            href={`https://finance.yahoo.com/quote/${encodeURIComponent(row.ticker)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={`Abrir gráfico de ${row.ticker} en Yahoo Finance`}
                            className="inline-flex items-center gap-1 font-mono font-semibold text-[#0F172A] hover:text-[#1D4ED8] hover:underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                          >
                            <span>{row.ticker}</span>
                            <ExternalLink
                              className="w-3 h-3 text-[#94A3B8]"
                              aria-hidden="true"
                            />
                          </a>
                          <span className="text-[#64748B] truncate">{row.name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-[#475569] whitespace-nowrap">
                        {row.sector}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-medium text-[#0F172A] tabular-nums whitespace-nowrap">
                        {formatPrice(row.price, row.currencySymbol)}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-mono font-medium tabular-nums whitespace-nowrap ${
                          isPositive ? 'text-[#059669]' : 'text-[#DC2626]'
                        }`}
                      >
                        {formatSignedPct(row.changePct)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[#475569] tabular-nums whitespace-nowrap">
                        {formatPrice(row.sma50, row.currencySymbol)}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <DistanceCell
                          distancePct={row.distanceSma50Pct}
                          thresholdPct={proximityThresholdPct}
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[#475569] tabular-nums whitespace-nowrap">
                        {formatPrice(row.sma200, row.currencySymbol)}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <DistanceCell
                          distancePct={row.distanceSma200Pct}
                          thresholdPct={proximityThresholdPct}
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[#475569] tabular-nums whitespace-nowrap">
                        {row.volumeRatio.toFixed(2).replace('.', ',')}x
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <SmaBadge match50={m50} match200={m200} />
                      </td>
                      <td className="py-2 pl-3 pr-5 whitespace-nowrap">
                        {renderSignalCell(row)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación limpia */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-4 text-xs text-[#475569]">
              <span className="tabular-nums">
                Mostrando {startIdx + 1}–{Math.min(startIdx + pageSize, rows.length)} de{' '}
                {rows.length} registros
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => onPageChange(safePage - 1)}
                  aria-label="Página anterior"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded-md text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Anterior</span>
                </button>
                <span className="font-mono tabular-nums px-2">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => onPageChange(safePage + 1)}
                  aria-label="Página siguiente"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded-md text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
