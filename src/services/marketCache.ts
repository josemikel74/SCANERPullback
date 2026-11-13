import type {
  MarketCacheEntry,
  MarketId,
  NetworkIncident,
  Timeframe,
  YahooChartResponse,
} from '../types/market';

export const MARKET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

const marketSeriesCache = new Map<string, MarketCacheEntry>();

/**
 * Genera la clave determinista `${mercado}_${temporalidad}` para el caché en memoria.
 */
export function buildMarketCacheKey(
  market: MarketId,
  timeframe: Timeframe
): string {
  return `${market}_${timeframe}`;
}

/**
 * Obtiene una entrada válida del caché en memoria si no ha superado su TTL de 5 minutos.
 */
export function getCachedMarketEntry(
  market: MarketId,
  timeframe: Timeframe
): MarketCacheEntry | null {
  const key = buildMarketCacheKey(market, timeframe);
  const entry = marketSeriesCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    marketSeriesCache.delete(key);
    return null;
  }

  return entry;
}

/**
 * Almacena las series OHLC descargadas en el Map en memoria con TTL de 5 minutos.
 */
export function setCachedMarketEntry(
  market: MarketId,
  timeframe: Timeframe,
  responses: YahooChartResponse[],
  incidents: NetworkIncident[],
  ttlMs: number = MARKET_CACHE_TTL_MS
): MarketCacheEntry {
  const key = buildMarketCacheKey(market, timeframe);
  const now = Date.now();
  const entry: MarketCacheEntry = {
    key,
    market,
    timeframe,
    responses,
    incidents,
    cachedAt: now,
    expiresAt: now + ttlMs,
  };
  marketSeriesCache.set(key, entry);
  return entry;
}

/**
 * Limpia una clave específica o todo el caché en memoria.
 */
export function clearMarketCache(market?: MarketId, timeframe?: Timeframe): void {
  if (market && timeframe) {
    marketSeriesCache.delete(buildMarketCacheKey(market, timeframe));
    return;
  }
  marketSeriesCache.clear();
}

/**
 * Devuelve cuántas entradas vigentes existen actualmente en caché.
 */
export function getActiveCacheCount(): number {
  const now = Date.now();
  for (const [key, entry] of marketSeriesCache.entries()) {
    if (now > entry.expiresAt) {
      marketSeriesCache.delete(key);
    }
  }
  return marketSeriesCache.size;
}
