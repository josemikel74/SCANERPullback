import {
  Play,
  Search,
  Square,
  Star,
} from 'lucide-react';
import { MARKETS_METADATA, getTickersByMarket } from '../data/tickersData';
import type {
  MarketId,
  MaxAtrDistanceFilter,
  MinVolumeFilter,
  RsiFilterMode,
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
  // Filtros técnicos avanzados
  onlyGoldenCross: boolean;
  onToggleGoldenCross: (val: boolean) => void;
  onlyMacdCross: boolean;
  onToggleMacdCross: (val: boolean) => void;
  minVolumeFilter: MinVolumeFilter;
  onMinVolumeFilterChange: (val: MinVolumeFilter) => void;
  rsiFilter: RsiFilterMode;
  onRsiFilterChange: (val: RsiFilterMode) => void;
  maxAtrFilter: MaxAtrDistanceFilter;
  onMaxAtrFilterChange: (val: MaxAtrDistanceFilter) => void;
  // Watchlist personalizada (para contador en selector de mercado)
  watchlistTickers: string[];
}

const MARKETS: MarketId[] = ['IBEX35', 'DAX', 'SP500', 'EUROPE', 'WATCHLIST'];
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
  onlyGoldenCross,
  onToggleGoldenCross,
  onlyMacdCross,
  onToggleMacdCross,
  minVolumeFilter,
  onMinVolumeFilterChange,
  rsiFilter,
  onRsiFilterChange,
  maxAtrFilter,
  onMaxAtrFilterChange,
  watchlistTickers,
}: ScannerControlsProps) {
  const isScanning = scanStatus === 'SCANNING';

  return (
    <section
      aria-label="Controles de rastreo y filtros"
      className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4"
    >
      {/* Fila superior: Mercado, Temporalidad y Botón Iniciar / Detener */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Selector de Mercado */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[#475569]">
              Mercado / Índice
            </span>
            <div
              role="group"
              aria-label="Selector de mercado"
              className="inline-flex flex-wrap items-center p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg"
            >
              {MARKETS.map((m) => {
                const active = market === m;
                const count = getTickersByMarket(m, watchlistTickers).length;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={isScanning}
                    onClick={() => onMarketChange(m)}
                    className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 inline-flex items-center gap-1.5 ${
                      active
                        ? 'bg-white text-[#0F172A] shadow-xs border border-[#E2E8F0]'
                        : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
                    }`}
                  >
                    {m === 'WATCHLIST' && (
                      <Star
                        className={`w-3.5 h-3.5 ${active ? 'text-[#D97706] fill-[#F59E0B]' : 'text-[#94A3B8]'}`}
                        aria-hidden="true"
                      />
                    )}
                    <span>{MARKETS_METADATA[m].shortLabel}</span>
                    <span className="font-mono tabular-nums text-[11px] text-[#64748B]">
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
                    className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
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
              disabled={market === 'WATCHLIST' && watchlistTickers.length === 0}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Play className="w-4 h-4 fill-current" aria-hidden="true" />
              <span>Iniciar Escaneo</span>
            </button>
          )}
        </div>
      </div>

      {/* Separador sutil */}
      <div className="border-t border-[#E2E8F0]" />

      {/* Fila intermedia: Interruptor de Estrategia + Búsqueda + Sector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-[#475569] whitespace-nowrap">
            Estrategia:
          </span>
          <div
            role="group"
            aria-label="Interruptor de estrategia de pullback"
            className="inline-flex flex-wrap items-center p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg"
          >
            <button
              type="button"
              onClick={() => onStrategyChange('PROXIMITY')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
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
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                strategy === 'BOUNCE'
                  ? 'bg-white text-[#0F172A] shadow-xs border border-[#E2E8F0]'
                  : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
              }`}
            >
              Modo B: Toque y Rebote Estricto
            </button>
            <button
              type="button"
              onClick={() => onStrategyChange('PULLBACK_MACD')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                strategy === 'PULLBACK_MACD'
                  ? 'bg-[#ECFDF5] text-[#059669] shadow-xs border border-[#A7F3D0]'
                  : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
              }`}
            >
              Modo C: Pullback + Cruce MACD
            </button>
            <button
              type="button"
              onClick={() => onStrategyChange('STATISTICAL_AGENT')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                strategy === 'STATISTICAL_AGENT'
                  ? 'bg-[#EEF2FF] text-[#3730A3] shadow-xs border border-[#C7D2FE]'
                  : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
              }`}
            >
              Modo D: Agente Estadístico
            </button>
          </div>

          {(strategy === 'PROXIMITY' || strategy === 'PULLBACK_MACD') && (
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
              className="pl-8 pr-3 py-2 w-52 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
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

      {/* Fila de Filtros Técnicos Avanzados (sin llamadas de red adicionales) */}
      <div className="pt-2 border-t border-[#F1F5F9] flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold text-[#475569]">Filtros Técnicos:</span>

        <button
          type="button"
          onClick={() => onToggleGoldenCross(!onlyGoldenCross)}
          className={`px-3 py-1.5 rounded-lg border font-medium transition-colors whitespace-nowrap ${
            onlyGoldenCross
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
              : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          Golden Cross (SMA 50 &gt; 200)
        </button>

        <button
          type="button"
          onClick={() => onToggleMacdCross(!onlyMacdCross)}
          className={`px-3 py-1.5 rounded-lg border font-medium transition-colors whitespace-nowrap ${
            onlyMacdCross
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
              : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          Cruce MACD (al alza)
        </button>

        <label className="inline-flex items-center gap-2 text-[#475569]">
          <span>Vol. Rel.:</span>
          <select
            value={minVolumeFilter}
            onChange={(e) =>
              onMinVolumeFilterChange(Number(e.target.value) as MinVolumeFilter)
            }
            aria-label="Volumen relativo mínimo"
            className="px-2.5 py-1.5 text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value={0}>Cualquiera</option>
            <option value={1.2}>≥ 1,2x media</option>
            <option value={1.5}>≥ 1,5x media</option>
            <option value={2}>≥ 2,0x media</option>
          </select>
        </label>

        <label className="inline-flex items-center gap-2 text-[#475569]">
          <span>RSI (14):</span>
          <select
            value={rsiFilter}
            onChange={(e) => onRsiFilterChange(e.target.value as RsiFilterMode)}
            aria-label="Filtro por RSI 14"
            className="px-2.5 py-1.5 text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Todos</option>
            <option value="UNDER_55">RSI &lt; 55 (No sobrecompra)</option>
            <option value="ZONE_35_55">RSI 35–55 (Zona pullback)</option>
          </select>
        </label>

        <label className="inline-flex items-center gap-2 text-[#475569]">
          <span>Dist. ATR:</span>
          <select
            value={maxAtrFilter}
            onChange={(e) =>
              onMaxAtrFilterChange(Number(e.target.value) as MaxAtrDistanceFilter)
            }
            aria-label="Filtro de distancia normalizada en ATR"
            className="px-2.5 py-1.5 text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value={0}>Todas</option>
            <option value={0.5}>≤ 0,5 ATR</option>
            <option value={1}>≤ 1,0 ATR</option>
            <option value={1.5}>≤ 1,5 ATR</option>
          </select>
        </label>
      </div>
    </section>
  );
}
