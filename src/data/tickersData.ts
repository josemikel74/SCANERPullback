import tickersJson from '../../data/tickers.json';
import type { MarketId, MarketMetadata, TickerInfo } from '../types/market';

interface TickersJsonPayload {
  IBEX35: TickerInfo[];
  DAX: TickerInfo[];
  SP500: TickerInfo[];
}

const MASTER_PAYLOAD = tickersJson as TickersJsonPayload;

/**
 * Listado maestro completo del IBEX 35 (35 componentes oficiales con sufijo .MC).
 */
export const IBEX_35_TICKERS: TickerInfo[] = MASTER_PAYLOAD.IBEX35;

/**
 * Listado maestro completo del DAX 40 (40 componentes oficiales con sufijo .DE).
 */
export const DAX_40_TICKERS: TickerInfo[] = MASTER_PAYLOAD.DAX;

/**
 * Listado maestro completo del S&P 500 (505 componentes oficiales sin recortes).
 */
export const SP500_TICKERS: TickerInfo[] = MASTER_PAYLOAD.SP500;

/**
 * Universo combinado europeo (IBEX 35 + DAX 40).
 */
export const EUROPE_TICKERS: TickerInfo[] = [...IBEX_35_TICKERS, ...DAX_40_TICKERS];

/**
 * Mapa maestro global de los 580 valores oficiales para búsqueda O(1).
 */
export const MASTER_TICKER_MAP: Map<string, TickerInfo> = new Map(
  [...IBEX_35_TICKERS, ...DAX_40_TICKERS, ...SP500_TICKERS].map((item) => [
    item.ticker.toUpperCase(),
    item,
  ])
);

export const MARKETS_METADATA: Record<MarketId, MarketMetadata> = {
  IBEX35: {
    id: 'IBEX35',
    label: 'IBEX 35 (España)',
    shortLabel: 'IBEX 35',
    country: 'España · Bolsas y Mercados Españoles',
    currency: 'EUR',
    currencySymbol: '€',
    suffix: '.MC',
    totalExpected: IBEX_35_TICKERS.length,
  },
  DAX: {
    id: 'DAX',
    label: 'DAX 40 (Alemania)',
    shortLabel: 'DAX 40',
    country: 'Alemania · Xetra Frankfurt',
    currency: 'EUR',
    currencySymbol: '€',
    suffix: '.DE',
    totalExpected: DAX_40_TICKERS.length,
  },
  SP500: {
    id: 'SP500',
    label: 'S&P 500 (EE. UU.)',
    shortLabel: 'S&P 500',
    country: 'Estados Unidos · NYSE / NASDAQ',
    currency: 'USD',
    currencySymbol: '$',
    suffix: '',
    totalExpected: SP500_TICKERS.length,
  },
  EUROPE: {
    id: 'EUROPE',
    label: 'Europa Combinado (IBEX 35 + DAX 40)',
    shortLabel: 'Europa',
    country: 'España + Alemania · BME y Xetra',
    currency: 'EUR',
    currencySymbol: '€',
    suffix: '.MC/.DE',
    totalExpected: EUROPE_TICKERS.length,
  },
  WATCHLIST: {
    id: 'WATCHLIST',
    label: 'Watchlist Personalizada',
    shortLabel: 'Watchlist',
    country: 'Selección propia multi-índice (localStorage)',
    currency: 'MIXED',
    currencySymbol: '$',
    suffix: '',
    totalExpected: 0,
  },
};

/**
 * Deduce el símbolo de divisa por ticker (útil en Europa y Watchlist multi-mercado).
 */
export function inferTickerCurrencySymbol(ticker: string, fallback: '€' | '$' = '$'): '€' | '$' {
  const upper = ticker.toUpperCase();
  if (
    upper.endsWith('.MC') ||
    upper.endsWith('.DE') ||
    upper.endsWith('.PA') ||
    upper.endsWith('.AS') ||
    upper.endsWith('.MI') ||
    upper.endsWith('.BR') ||
    upper.endsWith('.LS')
  ) {
    return '€';
  }
  return fallback;
}

/**
 * Resuelve metadatos de un ticker desde el universo maestro o crea una ficha personalizada.
 */
export function resolveTickerInfo(ticker: string): TickerInfo {
  const normalized = ticker.trim().toUpperCase();
  const known = MASTER_TICKER_MAP.get(normalized);
  if (known) return known;
  return {
    ticker: normalized,
    name: normalized,
    sector: 'Personalizado',
  };
}

/**
 * Devuelve el listado completo de tickers del mercado indicado (o Watchlist personalizada).
 */
export function getTickersByMarket(
  market: MarketId,
  customWatchlist: string[] = []
): TickerInfo[] {
  switch (market) {
    case 'IBEX35':
      return IBEX_35_TICKERS;
    case 'DAX':
      return DAX_40_TICKERS;
    case 'SP500':
      return SP500_TICKERS;
    case 'EUROPE':
      return EUROPE_TICKERS;
    case 'WATCHLIST':
      return customWatchlist.map(resolveTickerInfo);
  }
}
