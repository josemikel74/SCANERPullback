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
  if (market) {
    for (const key of Array.from(marketSeriesCache.keys())) {
      if (key.startsWith(`${market}_`)) {
        marketSeriesCache.delete(key);
      }
    }
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

/**
 * Busca en todas las entradas vigentes del caché las series más recientes
 * para un listado de tickers (útil para mostrar seguimiento en vivo en Watchlist).
 */
export function getCachedResponsesForTickers(
  tickers: string[],
  preferredTimeframe: Timeframe
): Map<string, { response: YahooChartResponse; market: MarketId }> {
  const result = new Map<string, { response: YahooChartResponse; market: MarketId }>();
  if (tickers.length === 0) return result;

  const wanted = new Set(tickers.map((t) => t.toUpperCase()));
  const now = Date.now();

  const validEntries: MarketCacheEntry[] = [];
  for (const [key, entry] of marketSeriesCache.entries()) {
    if (now > entry.expiresAt) {
      marketSeriesCache.delete(key);
    } else {
      validEntries.push(entry);
    }
  }

  // Priorizar entradas de la temporalidad activa y más recientes primero
  validEntries.sort((a, b) => {
    const prefA = a.timeframe === preferredTimeframe ? 1 : 0;
    const prefB = b.timeframe === preferredTimeframe ? 1 : 0;
    if (prefA !== prefB) return prefB - prefA;
    return b.cachedAt - a.cachedAt;
  });

  for (const entry of validEntries) {
    for (const res of entry.responses) {
      const upper = res.ticker.toUpperCase();
      if (wanted.has(upper) && !result.has(upper)) {
        result.set(upper, { response: res, market: entry.market });
      }
    }
  }

  return result;
}
