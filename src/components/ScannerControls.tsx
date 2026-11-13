import { Play, Search, Square } from 'lucide-react';
import { MARKETS_METADATA, getTickersByMarket } from '../data/tickersData';
import type {
  MarketId,
  ScanStatus,
  SmaFilter,
  StrategyMode,
  Timeframe,
} from '../types/market';

interface ScannerControlsProps {
  market: MarketId;
  onMarketChange: (market: MarketId) => void;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  strategy: StrategyMode;
  onStrategyChange: (strategy: StrategyMode) => void;
  proximityThresholdPct: number;
  onProximityThresholdChange: (value: number) => void;
  smaFilter: SmaFilter;
  onSmaFilterChange: (filter: SmaFilter) => void;
  scanStatus: ScanStatus;
  onStartScan: () => void;
  onStopScan: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  selectedSector: string;
  onSectorChange: (sector: string) => void;
  availableSectors: string[];
  showAllTickers: boolean;
  onToggleShowAllTickers: (showAll: boolean) => void;
}

const MARKETS: MarketId[] = ['IBEX35', 'DAX', 'SP500'];
const TIMEFRAMES: Timeframe[] = ['1h', '4h', '1d', '1w'];
const SMA_FILTERS: { id: SmaFilter; label: string }[] = [
  { id: 'ALL', label: 'Todas' },
  { id: 'SMA50', label: 'SMA 50' },
  { id: 'SMA200', label: 'SMA 200' },
];

export function ScannerControls({
  market,
  onMarketChange,
  timeframe,
  onTimeframeChange,
  strategy,
  onStrategyChange,
  proximityThresholdPct,
  onProximityThresholdChange,
  smaFilter,
  onSmaFilterChange,
  scanStatus,
  onStartScan,
  onStopScan,
  searchQuery,
  onSearchQueryChange,
  selectedSector,
  onSectorChange,
  availableSectors,
  showAllTickers,
  onToggleShowAllTickers,
}: ScannerControlsProps) {
  const isScanning = scanStatus === 'SCANNING';

  return (
    <section
      aria-label="Controles de rastreo y filtros"
      className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-5"
    >
      {/* Fila superior: Mercado, Temporalidad y Botón Iniciar / Detener */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-5">
          {/* Selector de Mercado */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[#475569]">
              Mercado / Índice
            </span>
            <div
              role="group"
              aria-label="Selector de mercado"
              className="inline-flex items-center p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg"
            >
              {MARKETS.map((m) => {
                const active = market === m;
                const count = getTickersByMarket(m).length;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={isScanning}
                    onClick={() => onMarketChange(m)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      active
                        ? 'bg-white text-[#0F172A] shadow-xs border border-[#E2E8F0]'
                        : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
                    }`}
                  >
                    <span>{MARKETS_METADATA[m].shortLabel}</span>
                    <span className="ml-1.5 font-mono tabular-nums text-[11px] text-[#64748B]">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selector de Temporalidad */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[#475569]">
              Temporalidad
            </span>
            <div
              role="group"
              aria-label="Selector de temporalidad"
              className="inline-flex items-center p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg"
            >
              {TIMEFRAMES.map((tf) => {
                const active = timeframe === tf;
                return (
                  <button
                    key={tf}
                    type="button"
                    disabled={isScanning}
                    onClick={() => onTimeframeChange(tf)}
                    className={`px-3 py-2 text-xs font-mono font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      active
                        ? 'bg-white text-[#0F172A] shadow-xs border border-[#E2E8F0]'
                        : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
                    }`}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filtro de Media Móvil */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[#475569]">
              Media Móvil Objetivo
            </span>
            <div
              role="group"
              aria-label="Filtro de media móvil"
              className="inline-flex items-center p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg"
            >
              {SMA_FILTERS.map((item) => {
                const active = smaFilter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSmaFilterChange(item.id)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      active
                        ? 'bg-white text-[#0F172A] shadow-xs border border-[#E2E8F0]'
                        : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Botones Iniciar Escaneo / Detener */}
        <div className="flex items-center gap-3 shrink-0">
          {isScanning ? (
            <button
              type="button"
              onClick={onStopScan}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            >
              <Square className="w-4 h-4 fill-current" aria-hidden="true" />
              <span>Detener</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartScan}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Play className="w-4 h-4 fill-current" aria-hidden="true" />
              <span>Iniciar Escaneo</span>
            </button>
          )}
        </div>
      </div>

      {/* Separador sutil */}
      <div className="border-t border-[#E2E8F0]" />

      {/* Fila inferior: Interruptor de Estrategia + Búsqueda + Sector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Interruptor de Estrategia */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-[#475569] whitespace-nowrap">
            Estrategia:
          </span>
          <div
            role="group"
            aria-label="Interruptor de estrategia de pullback"
            className="inline-flex items-center p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg"
          >
            <button
              type="button"
              onClick={() => onStrategyChange('PROXIMITY')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                strategy === 'PROXIMITY'
                  ? 'bg-white text-[#0F172A] shadow-xs border border-[#E2E8F0]'
                  : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
              }`}
            >
              Modo A: Zona de Proximidad
            </button>
            <button
              type="button"
              onClick={() => onStrategyChange('BOUNCE')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                strategy === 'BOUNCE'
                  ? 'bg-white text-[#0F172A] shadow-xs border border-[#E2E8F0]'
                  : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
              }`}
            >
              Modo B: Toque y Rebote Estricto
            </button>
          </div>

          {strategy === 'PROXIMITY' && (
            <label className="inline-flex items-center gap-2 text-xs text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-1.5">
              <span className="whitespace-nowrap font-medium">Rango ±</span>
              <input
                type="number"
                min={0.1}
                max={10}
                step={0.1}
                value={proximityThresholdPct}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  if (!Number.isNaN(parsed)) {
                    onProximityThresholdChange(
                      Math.min(10, Math.max(0.1, Number(parsed.toFixed(1))))
                    );
                  }
                }}
                aria-label="Porcentaje de proximidad a la media móvil"
                className="w-14 bg-white border border-[#E2E8F0] rounded px-1.5 py-0.5 text-right font-mono tabular-nums text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <span className="font-mono font-semibold text-[#0F172A]">%</span>
            </label>
          )}
        </div>

        {/* Búsqueda, Sector y Toggle de visualización */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Buscar ticker o empresa..."
              aria-label="Buscar ticker o empresa"
              className="pl-8 pr-3 py-2 w-56 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select
            value={selectedSector}
            onChange={(e) => onSectorChange(e.target.value)}
            aria-label="Filtrar por sector"
            className="px-3 py-2 text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Todos los sectores</option>
            {availableSectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onToggleShowAllTickers(!showAllTickers)}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              showAllTickers
                ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
                : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            {showAllTickers ? 'Mostrando todo el índice' : 'Solo señales detectadas'}
          </button>
        </div>
      </div>
    </section>
  );
}
