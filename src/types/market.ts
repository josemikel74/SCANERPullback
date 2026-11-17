/**
 * Definiciones estrictas de tipos para el sistema de monitorización de pullbacks SMA.
 * Diseñado para garantizar compatibilidad total con `tsc --noEmit` en pipelines CI/CD.
 */

export type MarketId = 'IBEX35' | 'DAX' | 'SP500' | 'EUROPE' | 'WATCHLIST';

export type Timeframe = '1h' | '4h' | '1d' | '1w';

export type StrategyMode = 'PROXIMITY' | 'BOUNCE';

export type SmaFilter = 'ALL' | 'SMA50' | 'SMA200';

export type MatchedSma = 'SMA50' | 'SMA200' | 'BOTH';

export type TrendDirection = 'ALCISTA' | 'BAJISTA' | 'LATERAL';

export type ScanStatus = 'IDLE' | 'SCANNING' | 'STOPPED' | 'COMPLETED';

export type ActiveViewTab = 'SCANNER' | 'UNIVERSE' | 'METHODOLOGY';

export type RsiFilterMode = 'ALL' | 'UNDER_55' | 'ZONE_35_55';

export type MinVolumeFilter = 0 | 1.2 | 1.5 | 2.0;

export type MaxAtrDistanceFilter = 0 | 0.5 | 1.0 | 1.5;

export type SortColumn =
  | 'minSmaDistance'
  | 'ticker'
  | 'price'
  | 'changePct'
  | 'distanceSma50Pct'
  | 'distanceSma200Pct'
  | 'rsi14'
  | 'atrDistance'
  | 'volumeRatio';

export type SortDirection = 'asc' | 'desc';

export interface OmittedTickerItem {
  ticker: string;
  name: string;
  reasonType: 'NETWORK_ERROR' | 'INSUFFICIENT_HISTORY';
  reasonDetail: string;
  candlesAvailable?: number;
}

export interface TickerInfo {
  ticker: string;
  name: string;
  sector: string;
}

export interface MarketMetadata {
  id: MarketId;
  label: string;
  shortLabel: string;
  country: string;
  currency: 'EUR' | 'USD' | 'MIXED';
  currencySymbol: '€' | '$';
  suffix: string;
  totalExpected: number;
}

export interface OHLCVCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SmaDiagnostics {
  smaCurrent: number | null;
  sma10Ago: number | null;
  /** Serie de SMA desde la vela actual (índice 0) hasta 15 velas atrás (índice 15) */
  smaLast16: Array<number | null>;
  slopePositiveOrFlat: boolean;
  wasAboveIn5To15: boolean;
  touchedRecently: boolean;
  closedStrictlyAbove: boolean;
  distancePct: number | null;
}

export interface BacktestSmaSummary {
  eventsCount: number;
  winRate5Pct: number | null;
  avgReturn5Pct: number | null;
  winRate10Pct: number | null;
  avgReturn10Pct: number | null;
}

export interface PullbackBacktestStats {
  evaluatedBars: number;
  sma50: BacktestSmaSummary;
  sma200: BacktestSmaSummary;
}

export interface StockAnalysisResult {
  ticker: string;
  name: string;
  sector: string;
  market: MarketId;
  timeframe: Timeframe;
  currencySymbol: '€' | '$';
  price: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  sma50: number | null;
  sma200: number | null;
  distanceSma50Pct: number | null;
  distanceSma200Pct: number | null;
  matchedSma: MatchedSma | null;
  isProximityMatch50: boolean;
  isProximityMatch200: boolean;
  isBounceMatch50: boolean;
  isBounceMatch200: boolean;
  diagnostics50: SmaDiagnostics;
  diagnostics200: SmaDiagnostics;
  rsi14: number | null;
  atr14: number | null;
  atrDistance50: number | null;
  atrDistance200: number | null;
  isGoldenCross: boolean;
  backtest: PullbackBacktestStats;
  candles: OHLCVCandle[];
  trend: TrendDirection;
  volumeRatio: number;
  candlesCount: number;
  validCandlesCount: number;
  signalSummary: string;
  lastUpdated: string;
  proxyUsed: string;
}

export interface ScanParameters {
  market: MarketId;
  timeframe: Timeframe;
  strategy: StrategyMode;
  proximityThresholdPct: number;
  smaFilter: SmaFilter;
}

export interface YahooChartResponse {
  ticker: string;
  timeframe: Timeframe;
  candles: OHLCVCandle[];
  regularMarketPrice: number;
  previousClose: number;
  currency: string;
  fetchedAt: number;
  proxyUsed: string;
}

export interface NetworkIncident {
  ticker: string;
  message: string;
  timestamp: string;
}

export interface BatchProgressUpdate {
  processed: number;
  total: number;
  incidents: number;
  latestResult?: YahooChartResponse;
  latestError?: NetworkIncident;
}

export interface MarketCacheEntry {
  key: string;
  market: MarketId;
  timeframe: Timeframe;
  responses: YahooChartResponse[];
  incidents: NetworkIncident[];
  cachedAt: number;
  expiresAt: number;
}

export interface SmaEvaluationOutput {
  validCandlesCount: number;
  sma50: number | null;
  sma200: number | null;
  distanceSma50Pct: number | null;
  distanceSma200Pct: number | null;
  proximityMatch50: boolean;
  proximityMatch200: boolean;
  bounceMatch50: boolean;
  bounceMatch200: boolean;
  diagnostics50: SmaDiagnostics;
  diagnostics200: SmaDiagnostics;
  rsi14: number | null;
  atr14: number | null;
  atrDistance50: number | null;
  atrDistance200: number | null;
  isGoldenCross: boolean;
  backtest: PullbackBacktestStats;
}
