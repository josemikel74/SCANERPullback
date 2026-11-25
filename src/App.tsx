import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MethodologyView } from './components/MethodologyView';
import { OmittedTickersPanel } from './components/OmittedTickersPanel';
import { ResultsTable } from './components/ResultsTable';
import { ScannerControls } from './components/ScannerControls';
import { StockDetailDrawer } from './components/StockDetailDrawer';
import { TopBar } from './components/TopBar';
import { UniverseView } from './components/UniverseView';
import {
  MARKETS_METADATA,
  getTickersByMarket,
  inferTickerCurrencySymbol,
} from './data/tickersData';
import {
  clearMarketCache,
  getCachedMarketEntry,
  setCachedMarketEntry,
} from './services/marketCache';
import {
  deduplicateTickers,
  loadWatchlistTickers,
  saveWatchlistTickers,
  toggleWatchlistTicker,
} from './services/watchlistService';
import { fetchMarketBatch } from './services/yahooService';
import type {
  ActiveViewTab,
  MarketId,
  MaxAtrDistanceFilter,
  MinVolumeFilter,
  NetworkIncident,
  OmittedTickerItem,
  RsiFilterMode,
  ScanStatus,
  SmaFilter,
  SortColumn,
  SortDirection,
  StockAnalysisResult,
  StrategyMode,
  TickerInfo,
  Timeframe,
  TrendDirection,
  YahooChartResponse,
} from './types/market';
import {
  SMA_LONG_PERIOD,
  SMA_SHORT_PERIOD,
  evaluatePullbackSignals,
  sanitizeCandles,
} from './utils/indicators';

const PAGE_SIZE = 50;

/**
 * Convierte un ticker de Yahoo Finance al formato de lista de seguimiento de TradingView.
 */
function toTradingViewSymbol(ticker: string): string {
  if (ticker.endsWith('.MC')) {
    return `BME:${ticker.slice(0, -3)}`;
  }
  if (ticker.endsWith('.DE')) {
    return `XETR:${ticker.slice(0, -3)}`;
  }
  return ticker.replace(/-/g, '.');
}

function getMinRelevantSmaDistance(
  row: StockAnalysisResult,
  smaFilter: SmaFilter
): number {
  const d50 =
    row.distanceSma50Pct !== null
      ? Math.abs(row.distanceSma50Pct)
      : Number.MAX_SAFE_INTEGER;
  const d200 =
    row.distanceSma200Pct !== null
      ? Math.abs(row.distanceSma200Pct)
      : Number.MAX_SAFE_INTEGER;

  if (smaFilter === 'SMA50') return d50;
  if (smaFilter === 'SMA200') return d200;
  return Math.min(d50, d200);
}

function getMinRelevantAtrDistance(
  row: StockAnalysisResult,
  smaFilter: SmaFilter
): number | null {
  if (smaFilter === 'SMA50') {
    return row.atrDistance50 !== null ? Math.abs(row.atrDistance50) : null;
  }
  if (smaFilter === 'SMA200') {
    return row.atrDistance200 !== null ? Math.abs(row.atrDistance200) : null;
  }
  if (row.atrDistance50 !== null && row.atrDistance200 !== null) {
    return Math.min(Math.abs(row.atrDistance50), Math.abs(row.atrDistance200));
  }
  if (row.atrDistance50 !== null) return Math.abs(row.atrDistance50);
  if (row.atrDistance200 !== null) return Math.abs(row.atrDistance200);
  return null;
}

function mapYahooResponseToStockResult(
  yahooRes: YahooChartResponse,
  tickerInfo: TickerInfo,
  market: MarketId,
  proximityThresholdPct: number
): StockAnalysisResult {
  const validCandles = sanitizeCandles(yahooRes.candles);
  const lastCandle =
    validCandles[validCandles.length - 1] ??
    yahooRes.candles[yahooRes.candles.length - 1];
  const prevCandle =
    validCandles.length >= 2
      ? validCandles[validCandles.length - 2]
      : lastCandle;
  const meta = MARKETS_METADATA[market];
  const currencySymbol = inferTickerCurrencySymbol(
    tickerInfo.ticker,
    meta.currencySymbol
  );

  const price = lastCandle ? lastCandle.close : yahooRes.regularMarketPrice;
  const previousClose = yahooRes.previousClose || prevCandle.close;
  const changePct =
    previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;

  const evalOutput = evaluatePullbackSignals(validCandles, {
    proximityThresholdPct,
    shortPeriod: SMA_SHORT_PERIOD,
    longPeriod: SMA_LONG_PERIOD,
  });

  const recentVolumes = validCandles
    .slice(-21, -1)
    .map((c) => c.volume)
    .filter((v) => v > 0);
  const avgVolume =
    recentVolumes.length > 0
      ? recentVolumes.reduce((acc, v) => acc + v, 0) / recentVolumes.length
      : 0;
  const volumeRatio =
    avgVolume > 0 && lastCandle.volume > 0 ? lastCandle.volume / avgVolume : 1;

  let trend: TrendDirection = 'LATERAL';
  if (evalOutput.sma50 !== null && evalOutput.sma200 !== null) {
    if (evalOutput.sma50 > evalOutput.sma200 * 1.005) {
      trend = 'ALCISTA';
    } else if (evalOutput.sma50 < evalOutput.sma200 * 0.995) {
      trend = 'BAJISTA';
    }
  }

  let matchedSma: StockAnalysisResult['matchedSma'] = null;
  if (
    (evalOutput.proximityMatch50 || evalOutput.bounceMatch50) &&
    (evalOutput.proximityMatch200 || evalOutput.bounceMatch200)
  ) {
    matchedSma = 'BOTH';
  } else if (evalOutput.proximityMatch50 || evalOutput.bounceMatch50) {
    matchedSma = 'SMA50';
  } else if (evalOutput.proximityMatch200 || evalOutput.bounceMatch200) {
    matchedSma = 'SMA200';
  }

  let signalSummary = 'Fuera de rango de pullback';
  if (evalOutput.bounceMatch50 && evalOutput.bounceMatch200) {
    signalSummary = 'Toque y rebote estricto en confluencia SMA 50/200';
  } else if (evalOutput.bounceMatch50) {
    signalSummary = 'Toque y rebote estricto confirmado en SMA 50';
  } else if (evalOutput.bounceMatch200) {
    signalSummary = 'Toque y rebote estricto confirmado en SMA 200';
  } else if (evalOutput.proximityMatch50 && evalOutput.proximityMatch200) {
    signalSummary = 'En zona de confluencia alcista SMA 50 y SMA 200';
  } else if (
    evalOutput.proximityMatch50 &&
    evalOutput.distanceSma50Pct !== null
  ) {
    signalSummary = `Aproximación en tendencia a SMA 50 (${evalOutput.distanceSma50Pct >= 0 ? '+' : ''}${evalOutput.distanceSma50Pct.toFixed(2)}%)`;
  } else if (
    evalOutput.proximityMatch200 &&
    evalOutput.distanceSma200Pct !== null
  ) {
    signalSummary = `Aproximación en tendencia a SMA 200 (${evalOutput.distanceSma200Pct >= 0 ? '+' : ''}${evalOutput.distanceSma200Pct.toFixed(2)}%)`;
  }

  return {
    ticker: tickerInfo.ticker,
    name: tickerInfo.name,
    sector: tickerInfo.sector,
    market,
    timeframe: yahooRes.timeframe,
    currencySymbol,
    price,
    previousClose,
    open: lastCandle.open,
    high: lastCandle.high,
    low: lastCandle.low,
    changePct,
    sma50: evalOutput.sma50,
    sma200: evalOutput.sma200,
    distanceSma50Pct: evalOutput.distanceSma50Pct,
    distanceSma200Pct: evalOutput.distanceSma200Pct,
    matchedSma,
    isProximityMatch50: evalOutput.proximityMatch50,
    isProximityMatch200: evalOutput.proximityMatch200,
    isBounceMatch50: evalOutput.bounceMatch50,
    isBounceMatch200: evalOutput.bounceMatch200,
    diagnostics50: evalOutput.diagnostics50,
    diagnostics200: evalOutput.diagnostics200,
    rsi14: evalOutput.rsi14,
    atr14: evalOutput.atr14,
    atrDistance50: evalOutput.atrDistance50,
    atrDistance200: evalOutput.atrDistance200,
    macdLine: evalOutput.macdLine,
    macdSignal: evalOutput.macdSignal,
    macdHistogram: evalOutput.macdHistogram,
    isMacdBullishCross: evalOutput.isMacdBullishCross,
    isMacdBullish: evalOutput.isMacdBullish,
    isGoldenCross: evalOutput.isGoldenCross,
    backtest: evalOutput.backtest,
    candles: validCandles,
    trend,
    volumeRatio,
    candlesCount: yahooRes.candles.length,
    validCandlesCount: evalOutput.validCandlesCount,
    signalSummary,
    lastUpdated: new Date(yahooRes.fetchedAt).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    proxyUsed: yahooRes.proxyUsed,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveViewTab>('SCANNER');

  // Watchlist personalizada (localStorage)
  const [watchlistTickers, setWatchlistTickers] = useState<string[]>(() =>
    loadWatchlistTickers()
  );

  // Controles de escaneo
  const [market, setMarket] = useState<MarketId>('IBEX35');
  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const [strategy, setStrategy] = useState<StrategyMode>('PROXIMITY');
  const [proximityThresholdPct, setProximityThresholdPct] = useState<number>(1.5);
  const [smaFilter, setSmaFilter] = useState<SmaFilter>('ALL');

  // Filtros secundarios y técnicos avanzados
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [showAllTickers, setShowAllTickers] = useState<boolean>(false);
  const [onlyGoldenCross, setOnlyGoldenCross] = useState<boolean>(false);
  const [onlyMacdCross, setOnlyMacdCross] = useState<boolean>(false);
  const [minVolumeFilter, setMinVolumeFilter] = useState<MinVolumeFilter>(0);
  const [rsiFilter, setRsiFilter] = useState<RsiFilterMode>('ALL');
  const [maxAtrFilter, setMaxAtrFilter] = useState<MaxAtrDistanceFilter>(0);
  const [sortColumn, setSortColumn] = useState<SortColumn>('minSmaDistance');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Estado de ejecución en tiempo real y caché en memoria
  const [scanStatus, setScanStatus] = useState<ScanStatus>('IDLE');
  const [rawResponses, setRawResponses] = useState<YahooChartResponse[]>([]);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [networkIncidents, setNetworkIncidents] = useState<NetworkIncident[]>([]);
  const [fromCache, setFromCache] = useState<boolean>(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [copiedCount, setCopiedCount] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const watchlistSet = useMemo(
    () => new Set(watchlistTickers),
    [watchlistTickers]
  );

  const abortActiveScan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      abortActiveScan();
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, [abortActiveScan]);

  const activeUniverse = useMemo(
    () => getTickersByMarket(market, watchlistTickers),
    [market, watchlistTickers]
  );

  const tickerInfoMap = useMemo(() => {
    return new Map<string, TickerInfo>(activeUniverse.map((t) => [t.ticker, t]));
  }, [activeUniverse]);

  // Evaluación matemática en memoria (<10 ms) sobre las series cacheadas
  const { evaluatedData, recalcMs } = useMemo(() => {
    const start = performance.now();
    const results: StockAnalysisResult[] = [];

    for (const res of rawResponses) {
      const info = tickerInfoMap.get(res.ticker);
      if (info) {
        results.push(
          mapYahooResponseToStockResult(res, info, market, proximityThresholdPct)
        );
      }
    }

    const elapsed = Math.max(0.1, Number((performance.now() - start).toFixed(2)));
    return { evaluatedData: results, recalcMs: elapsed };
  }, [rawResponses, tickerInfoMap, market, proximityThresholdPct]);

  const selectedStock = useMemo(() => {
    if (!selectedTicker) return null;
    return evaluatedData.find((s) => s.ticker === selectedTicker) ?? null;
  }, [evaluatedData, selectedTicker]);

  // Control anti-errores transparente: tickers omitidos por error de red o historial insuficiente
  const omittedTickers = useMemo<OmittedTickerItem[]>(() => {
    const items: OmittedTickerItem[] = [];

    for (const inc of networkIncidents) {
      const info = tickerInfoMap.get(inc.ticker);
      items.push({
        ticker: inc.ticker,
        name: info?.name ?? inc.ticker,
        reasonType: 'NETWORK_ERROR',
        reasonDetail: inc.message,
      });
    }

    for (const row of evaluatedData) {
      if (row.validCandlesCount < SMA_LONG_PERIOD) {
        const missing =
          row.validCandlesCount < SMA_SHORT_PERIOD
            ? `Solo ${row.validCandlesCount} velas válidas (insuficiente para SMA 50 y SMA 200)`
            : `Solo ${row.validCandlesCount} velas válidas (omitido en evaluación SMA 200; requiere 200)`;
        items.push({
          ticker: row.ticker,
          name: row.name,
          reasonType: 'INSUFFICIENT_HISTORY',
          reasonDetail: missing,
          candlesAvailable: row.validCandlesCount,
        });
      }
    }

    return items;
  }, [networkIncidents, evaluatedData, tickerInfoMap]);

  // Sectores disponibles del índice actual
  const availableSectors = useMemo(() => {
    return Array.from(new Set(activeUniverse.map((t) => t.sector))).sort((a, b) =>
      a.localeCompare(b, 'es')
    );
  }, [activeUniverse]);

  // Estadísticas rápidas (KPIs) sobre los datos analizados actualmente
  const metrics = useMemo(() => {
    let totalSignals = 0;
    let sma50Signals = 0;
    let sma200Signals = 0;

    for (const row of evaluatedData) {
      const match50 =
        strategy === 'PROXIMITY' ? row.isProximityMatch50 : row.isBounceMatch50;
      const match200 =
        strategy === 'PROXIMITY' ? row.isProximityMatch200 : row.isBounceMatch200;

      if (match50) sma50Signals += 1;
      if (match200) sma200Signals += 1;

      if (
        (smaFilter === 'ALL' && (match50 || match200)) ||
        (smaFilter === 'SMA50' && match50) ||
        (smaFilter === 'SMA200' && match200)
      ) {
        totalSignals += 1;
      }
    }

    return {
      totalSignals,
      sma50Signals,
      sma200Signals,
    };
  }, [evaluatedData, strategy, smaFilter]);

  // Filtrado y ordenación de la tabla
  const filteredAndSortedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = evaluatedData.filter((row) => {
      if (selectedSector !== 'ALL' && row.sector !== selectedSector) {
        return false;
      }
      if (
        q &&
        !row.ticker.toLowerCase().includes(q) &&
        !row.name.toLowerCase().includes(q)
      ) {
        return false;
      }

      if (onlyGoldenCross && !row.isGoldenCross) {
        return false;
      }
      if (onlyMacdCross && !row.isMacdBullishCross) {
        return false;
      }
      if (minVolumeFilter > 0 && row.volumeRatio < minVolumeFilter) {
        return false;
      }
      if (rsiFilter === 'UNDER_55') {
        if (row.rsi14 === null || row.rsi14 >= 55) return false;
      } else if (rsiFilter === 'ZONE_35_55') {
        if (row.rsi14 === null || row.rsi14 < 35 || row.rsi14 > 55) return false;
      }
      if (maxAtrFilter > 0) {
        const atrDist = getMinRelevantAtrDistance(row, smaFilter);
        if (atrDist === null || atrDist > maxAtrFilter) return false;
      }

      if (showAllTickers) {
        return true;
      }

      const match50 =
        strategy === 'PROXIMITY' ? row.isProximityMatch50 : row.isBounceMatch50;
      const match200 =
        strategy === 'PROXIMITY' ? row.isProximityMatch200 : row.isBounceMatch200;

      if (smaFilter === 'SMA50') return match50;
      if (smaFilter === 'SMA200') return match200;
      return match50 || match200;
    });

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'minSmaDistance':
          comparison =
            getMinRelevantSmaDistance(a, smaFilter) -
            getMinRelevantSmaDistance(b, smaFilter);
          break;
        case 'ticker':
          comparison = a.ticker.localeCompare(b.ticker);
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'changePct':
          comparison = a.changePct - b.changePct;
          break;
        case 'distanceSma50Pct': {
          const valA =
            a.distanceSma50Pct !== null
              ? Math.abs(a.distanceSma50Pct)
              : Number.MAX_SAFE_INTEGER;
          const valB =
            b.distanceSma50Pct !== null
              ? Math.abs(b.distanceSma50Pct)
              : Number.MAX_SAFE_INTEGER;
          comparison = valA - valB;
          break;
        }
        case 'distanceSma200Pct': {
          const valA =
            a.distanceSma200Pct !== null
              ? Math.abs(a.distanceSma200Pct)
              : Number.MAX_SAFE_INTEGER;
          const valB =
            b.distanceSma200Pct !== null
              ? Math.abs(b.distanceSma200Pct)
              : Number.MAX_SAFE_INTEGER;
          comparison = valA - valB;
          break;
        }
        case 'rsi14': {
          const valA = a.rsi14 ?? Number.MAX_SAFE_INTEGER;
          const valB = b.rsi14 ?? Number.MAX_SAFE_INTEGER;
          comparison = valA - valB;
          break;
        }
        case 'macd': {
          const valA = a.macdHistogram ?? -Number.MAX_SAFE_INTEGER;
          const valB = b.macdHistogram ?? -Number.MAX_SAFE_INTEGER;
          comparison = valA - valB;
          break;
        }
        case 'atrDistance': {
          const valA =
            getMinRelevantAtrDistance(a, smaFilter) ?? Number.MAX_SAFE_INTEGER;
          const valB =
            getMinRelevantAtrDistance(b, smaFilter) ?? Number.MAX_SAFE_INTEGER;
          comparison = valA - valB;
          break;
        }
        case 'volumeRatio':
          comparison = a.volumeRatio - b.volumeRatio;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [
    evaluatedData,
    searchQuery,
    selectedSector,
    onlyGoldenCross,
    onlyMacdCross,
    minVolumeFilter,
    rsiFilter,
    maxAtrFilter,
    showAllTickers,
    strategy,
    smaFilter,
    sortColumn,
    sortDirection,
  ]);

  const hydrateFromCacheOrReset = useCallback(
    (nextMarket: MarketId, nextTimeframe: Timeframe) => {
      const cached = getCachedMarketEntry(nextMarket, nextTimeframe);
      if (cached) {
        setRawResponses(cached.responses);
        setNetworkIncidents(cached.incidents);
        setProcessedCount(cached.responses.length + cached.incidents.length);
        setFromCache(true);
        setScanStatus('COMPLETED');
      } else {
        setRawResponses([]);
        setNetworkIncidents([]);
        setProcessedCount(0);
        setFromCache(false);
        setScanStatus('IDLE');
      }
    },
    []
  );

  const handleMarketChange = (nextMarket: MarketId) => {
    abortActiveScan();
    setMarket(nextMarket);
    setSelectedSector('ALL');
    setSelectedTicker(null);
    setCurrentPage(1);
    hydrateFromCacheOrReset(nextMarket, timeframe);
  };

  const handleTimeframeChange = (nextTimeframe: Timeframe) => {
    abortActiveScan();
    setTimeframe(nextTimeframe);
    setSelectedTicker(null);
    setCurrentPage(1);
    hydrateFromCacheOrReset(market, nextTimeframe);
  };

  const handleToggleWatchlist = (ticker: string) => {
    setWatchlistTickers((prev) => {
      const next = toggleWatchlistTicker(prev, ticker);
      clearMarketCache('WATCHLIST');
      return next;
    });
  };

  const handleAddWatchlistTickers = (tickers: string[]) => {
    setWatchlistTickers((prev) => {
      const next = saveWatchlistTickers(deduplicateTickers([...prev, ...tickers]));
      clearMarketCache('WATCHLIST');
      return next;
    });
  };

  const handleRemoveWatchlistTicker = (ticker: string) => {
    setWatchlistTickers((prev) => {
      const next = saveWatchlistTickers(prev.filter((t) => t !== ticker));
      clearMarketCache('WATCHLIST');
      return next;
    });
  };

  const handleReplaceWatchlist = (tickers: string[]) => {
    const next = saveWatchlistTickers(tickers);
    setWatchlistTickers(next);
    clearMarketCache('WATCHLIST');
    if (market === 'WATCHLIST') {
      setRawResponses([]);
      setNetworkIncidents([]);
      setProcessedCount(0);
      setFromCache(false);
      setScanStatus('IDLE');
    }
  };

  const handleStartScan = async () => {
    if (activeUniverse.length === 0) return;
    abortActiveScan();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSelectedTicker(null);
    setCurrentPage(1);
    setFromCache(false);
    setScanStatus('SCANNING');
    setRawResponses([]);
    setProcessedCount(0);
    setNetworkIncidents([]);

    try {
      const { results, incidents, aborted } = await fetchMarketBatch(
        activeUniverse.map((t) => t.ticker),
        market,
        timeframe,
        (update) => {
          if (controller.signal.aborted) return;

          setProcessedCount(update.processed);

          if (update.latestResult) {
            const res = update.latestResult;
            setRawResponses((prev) => [...prev, res]);
          }

          if (update.latestError) {
            const err = update.latestError;
            setNetworkIncidents((prev) => [...prev, err]);
          }
        },
        controller.signal
      );

      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        if (!aborted && results.length > 0) {
          setCachedMarketEntry(market, timeframe, results, incidents);
        }
        setScanStatus(aborted ? 'STOPPED' : 'COMPLETED');
      }
    } catch {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setScanStatus(controller.signal.aborted ? 'STOPPED' : 'COMPLETED');
      }
    }
  };

  const handleStopScan = () => {
    abortActiveScan();
    setScanStatus('STOPPED');
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedSector('ALL');
    setSmaFilter('ALL');
    setProximityThresholdPct(1.5);
    setOnlyGoldenCross(false);
    setOnlyMacdCross(false);
    setMinVolumeFilter(0);
    setRsiFilter('ALL');
    setMaxAtrFilter(0);
    setShowAllTickers(false);
    setSortColumn('minSmaDistance');
    setSortDirection('asc');
    setCurrentPage(1);
  };

  /**
   * Exportación CSV compatible con Microsoft Excel en configuración regional española (UTF-8 BOM + ';' + coma decimal).
   */
  const handleExportCsv = () => {
    if (filteredAndSortedRows.length === 0) return;

    const fmtEs = (val: number | null) =>
      val !== null && Number.isFinite(val) ? val.toFixed(2).replace('.', ',') : '';

    const headers = [
      'Ticker',
      'Nombre',
      'Sector',
      'Mercado',
      'Temporalidad',
      'Precio',
      'Variacion %',
      'SMA 50',
      'Dist. SMA 50 %',
      'SMA 200',
      'Dist. SMA 200 %',
      'RSI 14',
      'MACD (12,26,9)',
      'MACD Senal',
      'MACD Histograma',
      'Cruce MACD',
      'ATR 14',
      'Dist. ATR SMA50',
      'Dist. ATR SMA200',
      'Golden Cross',
      'Volumen Relativo',
      'Velas Validas',
      'Resumen Senal',
    ];

    const lines = filteredAndSortedRows.map((r) => [
      r.ticker,
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.sector}"`,
      r.market,
      r.timeframe,
      fmtEs(r.price),
      fmtEs(r.changePct),
      fmtEs(r.sma50),
      fmtEs(r.distanceSma50Pct),
      fmtEs(r.sma200),
      fmtEs(r.distanceSma200Pct),
      fmtEs(r.rsi14),
      fmtEs(r.macdLine),
      fmtEs(r.macdSignal),
      fmtEs(r.macdHistogram),
      r.isMacdBullishCross ? 'CRUCE AL ALZA' : r.isMacdBullish ? 'ALCISTA' : 'BAJISTA',
      fmtEs(r.atr14),
      fmtEs(r.atrDistance50),
      fmtEs(r.atrDistance200),
      r.isGoldenCross ? 'SI' : 'NO',
      fmtEs(r.volumeRatio),
      String(r.validCandlesCount),
      `"${r.signalSummary}"`,
    ]);

    const csvBody = [headers.join(';'), ...lines.map((l) => l.join(';'))].join('\r\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pullbacks_${market.toLowerCase()}_${timeframe}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * Copia los tickers visibles en formato compatible con listas de seguimiento de TradingView.
   */
  const handleCopyTickers = async () => {
    if (filteredAndSortedRows.length === 0) return;

    const formatted = filteredAndSortedRows
      .map((r) => toTradingViewSymbol(r.ticker))
      .join(',');

    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedCount(filteredAndSortedRows.length);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedCount(null);
      }, 2500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = formatted;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedCount(filteredAndSortedRows.length);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedCount(null);
      }, 2500);
    }
  };

  const totalMarketTickers = activeUniverse.length;
  const marketMeta = MARKETS_METADATA[market];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onExportCsv={handleExportCsv}
        exportDisabled={activeTab !== 'SCANNER' || filteredAndSortedRows.length === 0}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
        {activeTab === 'SCANNER' && (
          <>
            {/* Encabezado de sección */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] text-balance">
                  Escáner de Pullbacks a SMA 50 y SMA 200
                </h1>
                <p className="text-xs text-[#64748B]">
                  {marketMeta.label} · {marketMeta.country} · Temporalidad {timeframe} ·
                  Haz clic en una fila para ver gráfico OHLC, RSI/ATR y backtest histórico
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#64748B] font-mono tabular-nums">
                {networkIncidents.length > 0 && (
                  <span className="text-[#B45309]">
                    Incidencias de red: {networkIncidents.length}
                  </span>
                )}
                <span>
                  Estado:{' '}
                  <span className="font-semibold text-[#0F172A]">
                    {scanStatus === 'SCANNING'
                      ? `Analizando ${processedCount} de ${totalMarketTickers} acciones...`
                      : scanStatus === 'STOPPED'
                        ? `Detenido (${processedCount}/${totalMarketTickers})`
                        : scanStatus === 'COMPLETED'
                          ? `Completado (${evaluatedData.length}/${totalMarketTickers})`
                          : `Listo (0/${totalMarketTickers})`}
                  </span>
                </span>
              </div>
            </div>

            {/* Panel de controles */}
            <ScannerControls
              market={market}
              onMarketChange={handleMarketChange}
              timeframe={timeframe}
              onTimeframeChange={handleTimeframeChange}
              strategy={strategy}
              onStrategyChange={(s) => {
                setStrategy(s);
                setCurrentPage(1);
              }}
              proximityThresholdPct={proximityThresholdPct}
              onProximityThresholdChange={(val) => {
                setProximityThresholdPct(val);
                setCurrentPage(1);
              }}
              smaFilter={smaFilter}
              onSmaFilterChange={(f) => {
                setSmaFilter(f);
                setCurrentPage(1);
              }}
              scanStatus={scanStatus}
              onStartScan={() => void handleStartScan()}
              onStopScan={handleStopScan}
              searchQuery={searchQuery}
              onSearchQueryChange={(q) => {
                setSearchQuery(q);
                setCurrentPage(1);
              }}
              selectedSector={selectedSector}
              onSectorChange={(s) => {
                setSelectedSector(s);
                setCurrentPage(1);
              }}
              availableSectors={availableSectors}
              showAllTickers={showAllTickers}
              onToggleShowAllTickers={(val) => {
                setShowAllTickers(val);
                setCurrentPage(1);
              }}
              onlyGoldenCross={onlyGoldenCross}
              onToggleGoldenCross={(val) => {
                setOnlyGoldenCross(val);
                setCurrentPage(1);
              }}
              onlyMacdCross={onlyMacdCross}
              onToggleMacdCross={(val) => {
                setOnlyMacdCross(val);
                setCurrentPage(1);
              }}
              minVolumeFilter={minVolumeFilter}
              onMinVolumeFilterChange={(val) => {
                setMinVolumeFilter(val);
                setCurrentPage(1);
              }}
              rsiFilter={rsiFilter}
              onRsiFilterChange={(val) => {
                setRsiFilter(val);
                setCurrentPage(1);
              }}
              maxAtrFilter={maxAtrFilter}
              onMaxAtrFilterChange={(val) => {
                setMaxAtrFilter(val);
                setCurrentPage(1);
              }}
              watchlistTickers={watchlistTickers}
              onAddWatchlistTickers={handleAddWatchlistTickers}
              onRemoveWatchlistTicker={handleRemoveWatchlistTicker}
              onReplaceWatchlist={handleReplaceWatchlist}
            />

            {/* Tira de KPIs */}
            <section
              aria-label="Resumen cuantitativo del escaneo"
              className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-[#E2E8F0] rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0]"
            >
              <div className="p-4 space-y-1">
                <span className="block text-xs font-medium text-[#64748B]">
                  Total Analizados
                </span>
                <span className="block text-xl font-bold font-mono tabular-nums text-[#0F172A]">
                  {evaluatedData.length} / {totalMarketTickers}
                </span>
              </div>

              <div className="p-4 space-y-1">
                <span className="block text-xs font-medium text-[#64748B]">
                  Pullbacks Detectados
                </span>
                <span className="block text-xl font-bold font-mono tabular-nums text-[#1D4ED8]">
                  {metrics.totalSignals}
                </span>
              </div>

              <div className="p-4 space-y-1">
                <span className="block text-xs font-medium text-[#64748B]">
                  En SMA 50
                </span>
                <span className="block text-xl font-bold font-mono tabular-nums text-[#0F172A]">
                  {metrics.sma50Signals}
                </span>
              </div>

              <div className="p-4 space-y-1">
                <span className="block text-xs font-medium text-[#64748B]">
                  En SMA 200
                </span>
                <span className="block text-xl font-bold font-mono tabular-nums text-[#4338CA]">
                  {metrics.sma200Signals}
                </span>
              </div>
            </section>

            {/* Panel de detalle con gráfico interactivo, RSI/ATR, backtest y verificación matemática */}
            {selectedStock && (
              <StockDetailDrawer
                stock={selectedStock}
                proximityThresholdPct={proximityThresholdPct}
                isWatched={watchlistSet.has(selectedStock.ticker)}
                onToggleWatchlist={handleToggleWatchlist}
                onClose={() => setSelectedTicker(null)}
              />
            )}

            {/* Tabla principal */}
            <ResultsTable
              rows={filteredAndSortedRows}
              market={market}
              timeframe={timeframe}
              totalMarketTickers={totalMarketTickers}
              scannedCount={processedCount}
              incidentCount={networkIncidents.length}
              fromCache={fromCache}
              recalcMs={recalcMs}
              scanStatus={scanStatus}
              strategy={strategy}
              proximityThresholdPct={proximityThresholdPct}
              smaFilter={smaFilter}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              onSelectStock={(stock) =>
                setSelectedTicker((prev) =>
                  prev === stock.ticker ? null : stock.ticker
                )
              }
              selectedTicker={selectedTicker}
              watchlistSet={watchlistSet}
              onToggleWatchlist={handleToggleWatchlist}
              onResetFilters={handleResetFilters}
              onStartScan={() => void handleStartScan()}
              onExportCsv={handleExportCsv}
              onCopyTickers={() => void handleCopyTickers()}
              copiedCount={copiedCount}
              currentPage={currentPage}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />

            {/* Panel desplegable discreto de control anti-errores */}
            <OmittedTickersPanel items={omittedTickers} />
          </>
        )}

        {activeTab === 'UNIVERSE' && <UniverseView />}

        {activeTab === 'METHODOLOGY' && <MethodologyView />}
      </main>

      <footer className="border-t border-[#E2E8F0] bg-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#64748B]">
          <span>
            PullbackMonitor · Monitorización institucional de medias móviles SMA 50 y SMA 200
          </span>
          <span className="tabular-nums">
            IBEX 35 · DAX 40 · S&amp;P 500 ({MARKETS_METADATA.IBEX35.totalExpected +
              MARKETS_METADATA.DAX.totalExpected +
              MARKETS_METADATA.SP500.totalExpected}{' '}
            valores) · Watchlist ({watchlistTickers.length})
          </span>
        </div>
      </footer>
    </div>
  );
}
