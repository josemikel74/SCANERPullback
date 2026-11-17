const WATCHLIST_STORAGE_KEY = 'pullback_monitor_watchlist_v1';

export const DEFAULT_WATCHLIST_TICKERS: string[] = [
  'ITX.MC',
  'SAN.MC',
  'IBE.MC',
  'SAP.DE',
  'SIE.DE',
  'AAPL',
  'MSFT',
  'NVDA',
];

/**
 * Normaliza un ticker (convierte prefijos TradingView BME:/XETR: a formato Yahoo Finance).
 */
export function normalizeSingleTicker(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/^"|"$/g, '');
  if (!cleaned) return null;

  if (cleaned.startsWith('BME:')) {
    return `${cleaned.slice(4)}.MC`;
  }
  if (cleaned.startsWith('XETR:')) {
    return `${cleaned.slice(5)}.DE`;
  }
  if (cleaned.includes(':')) {
    const [, sym] = cleaned.split(':');
    return sym ? sym.trim() : null;
  }
  if (!/^[A-Z0-9.-]{1,16}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function deduplicateTickers(list: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    const norm = normalizeSingleTicker(item);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}

export function loadWatchlistTickers(): string[] {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) {
      return [...DEFAULT_WATCHLIST_TICKERS];
    }
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return deduplicateTickers(parsed.filter((x): x is string => typeof x === 'string'));
    }
  } catch {
    // Ignorar errores de almacenamiento (modo privado o SSR)
  }
  return [...DEFAULT_WATCHLIST_TICKERS];
}

export function saveWatchlistTickers(tickers: string[]): string[] {
  const clean = deduplicateTickers(tickers);
  try {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Ignorar errores de cuota
  }
  return clean;
}

export function toggleWatchlistTicker(current: string[], ticker: string): string[] {
  const norm = normalizeSingleTicker(ticker);
  if (!norm) return current;

  const exists = current.includes(norm);
  const next = exists ? current.filter((t) => t !== norm) : [...current, norm];
  return saveWatchlistTickers(next);
}

/**
 * Importa tickers desde texto libre (separado por comas/saltos) o JSON (array o { tickers: [...] }).
 */
export function parseWatchlistImport(rawText: string): string[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return deduplicateTickers(parsed.filter((x): x is string => typeof x === 'string'));
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        'tickers' in parsed &&
        Array.isArray((parsed as { tickers: unknown }).tickers)
      ) {
        const list = (parsed as { tickers: unknown[] }).tickers.filter(
          (x): x is string => typeof x === 'string'
        );
        return deduplicateTickers(list);
      }
    } catch {
      // Continuar con parseo por separadores si no es JSON válido
    }
  }

  const tokens = trimmed.split(/[\s,;]+/);
  return deduplicateTickers(tokens);
}

export function exportWatchlistJson(tickers: string[]): string {
  return JSON.stringify(
    {
      name: 'PullbackMonitor Watchlist',
      exportedAt: new Date().toISOString(),
      tickers: deduplicateTickers(tickers),
    },
    null,
    2
  );
}
