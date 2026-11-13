import type {
  BatchProgressUpdate,
  MarketId,
  NetworkIncident,
  OHLCVCandle,
  Timeframe,
  YahooChartResponse,
} from '../types/market';

export const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_BATCH_SIZE = 6;
export const DEFAULT_BATCH_DELAY_MS = 300;

export interface CorsProxyProvider {
  name: string;
  buildUrl: (targetUrl: string) => string;
}

/**
 * Proxies públicos gratuitos ordenados en cascada para sortear restricciones CORS en navegador.
 */
export const PUBLIC_CORS_PROXIES: CorsProxyProvider[] = [
  {
    name: 'corsproxy.io',
    buildUrl: (targetUrl: string) => `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
  },
  {
    name: 'allorigins.win',
    buildUrl: (targetUrl: string) =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
  },
  {
    name: 'codetabs.com',
    buildUrl: (targetUrl: string) =>
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
  },
  {
    name: 'allorigins-json',
    buildUrl: (targetUrl: string) =>
      `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
  },
];

export interface YahooServiceOptions {
  /** Tiempo máximo de espera por cada intento de proxy en ms (por defecto 8000ms) */
  timeoutMs?: number;
  /** Número de tickers simultáneos por lote (por defecto 6) */
  batchSize?: number;
  /** Pausa en ms entre lotes consecutivos para evitar HTTP 429 (por defecto 300ms) */
  batchDelayMs?: number;
  /** Lista personalizada de proxies en cascada */
  proxies?: CorsProxyProvider[];
}

interface RawYahooChartPayload {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        currency?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
      };
      timestamp?: Array<number | null>;
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
}

/**
 * Mapea las temporalidades de la interfaz al intervalo y rango óptimos de Yahoo Finance v8.
 */
export function mapTimeframeToYahooParams(timeframe: Timeframe): {
  interval: string;
  range: string;
} {
  switch (timeframe) {
    case '1d':
      return { interval: '1d', range: '2y' };
    case '1w':
      return { interval: '1wk', range: '5y' };
    case '1h':
      return { interval: '60m', range: '60d' };
    case '4h':
      return { interval: '60m', range: '180d' };
  }
}

/**
 * Espera abortable para pausas entre lotes sin bloquear la cancelación inmediata del usuario.
 */
function delayWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Operación cancelada por el usuario.', 'AbortError'));
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Operación cancelada por el usuario.', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Función determinista que agrupa cada bloque de 4 velas horarias consecutivas
 * en velas de 4h matemáticamente exactas:
 * - Open de la 1ª vela
 * - High máximo del bloque
 * - Low mínimo del bloque
 * - Close de la 4ª vela
 */
export function aggregateHourlyTo4H(hourlyCandles: OHLCVCandle[]): OHLCVCandle[] {
  if (hourlyCandles.length < 4) {
    return [];
  }

  // Alineamos desde el final para que la última vela de 4h cierre exactamente con la última vela 1h disponible
  const startOffset = hourlyCandles.length % 4;
  const aggregated: OHLCVCandle[] = [];

  for (let i = startOffset; i + 3 < hourlyCandles.length; i += 4) {
    const c1 = hourlyCandles[i];
    const c2 = hourlyCandles[i + 1];
    const c3 = hourlyCandles[i + 2];
    const c4 = hourlyCandles[i + 3];

    aggregated.push({
      timestamp: c1.timestamp,
      open: c1.open,
      high: Math.max(c1.high, c2.high, c3.high, c4.high),
      low: Math.min(c1.low, c2.low, c3.low, c4.low),
      close: c4.close,
      volume: c1.volume + c2.volume + c3.volume + c4.volume,
    });
  }

  return aggregated;
}

/**
 * Normaliza y limpia la respuesta JSON de Yahoo Finance descartando huecos nulos.
 */
function parseYahooChartPayload(
  payload: RawYahooChartPayload,
  ticker: string,
  timeframe: Timeframe,
  proxyUsed: string
): YahooChartResponse {
  if (payload.chart?.error) {
    throw new Error(
      payload.chart.error.description ??
        payload.chart.error.code ??
        `Error de Yahoo Finance para ${ticker}`
    );
  }

  const result = payload.chart?.result?.[0];
  if (!result) {
    throw new Error(`Respuesta vacía de Yahoo Finance para ${ticker}`);
  }

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote || timestamps.length === 0) {
    throw new Error(`Sin series OHLC disponibles para ${ticker}`);
  }

  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];

  const rawCandles: OHLCVCandle[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const volume = volumes[i] ?? 0;

    if (
      ts != null &&
      open != null &&
      high != null &&
      low != null &&
      close != null &&
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close) &&
      close > 0
    ) {
      rawCandles.push({
        timestamp: ts * 1000,
        open,
        high,
        low,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      });
    }
  }

  if (rawCandles.length === 0) {
    throw new Error(`Velas OHLC inválidas o vacías para ${ticker}`);
  }

  const finalCandles =
    timeframe === '4h' ? aggregateHourlyTo4H(rawCandles) : rawCandles;

  if (finalCandles.length === 0) {
    throw new Error(`Insuficientes velas horarias para construir barras 4h de ${ticker}`);
  }

  const lastCandle = finalCandles[finalCandles.length - 1];
  const prevCandle =
    finalCandles.length >= 2 ? finalCandles[finalCandles.length - 2] : lastCandle;

  const metaPrice = result.meta?.regularMarketPrice;
  const regularMarketPrice =
    typeof metaPrice === 'number' && Number.isFinite(metaPrice) && metaPrice > 0
      ? metaPrice
      : lastCandle.close;

  const metaPrevClose = result.meta?.chartPreviousClose ?? result.meta?.previousClose;
  const previousClose =
    timeframe === '1d' &&
    typeof prevCandle.close === 'number' &&
    prevCandle.close > 0
      ? prevCandle.close
      : typeof metaPrevClose === 'number' && Number.isFinite(metaPrevClose) && metaPrevClose > 0
        ? metaPrevClose
        : prevCandle.close;

  return {
    ticker,
    timeframe,
    candles: finalCandles,
    regularMarketPrice,
    previousClose,
    currency: result.meta?.currency ?? 'USD',
    fetchedAt: Date.now(),
    proxyUsed,
  };
}

let lastSuccessfulProxyName: string | null = null;

/**
 * Ejecuta una petición HTTP con timeout y cascada automática de proxies CORS.
 * Si un proxy falla, excede los 8000ms o devuelve HTML/JSON inválido, salta al siguiente.
 * Prioriza el último proxy que respondió correctamente para acelerar escaneos por lotes.
 */
export async function fetchWithFallback(
  targetUrl: string,
  options: {
    timeoutMs?: number;
    proxies?: CorsProxyProvider[];
    signal?: AbortSignal;
  } = {}
): Promise<{ data: RawYahooChartPayload; proxyUsed: string }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseProxies = options.proxies ?? PUBLIC_CORS_PROXIES;

  const baseList: CorsProxyProvider[] = [...baseProxies];

  // En modo desarrollo Vite (localhost / entorno dev) añadimos el proxy local de Vite como respaldo sin API keys
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    baseList.push({
      name: 'vite-dev-proxy',
      buildUrl: (u: string) => u.replace('https://query1.finance.yahoo.com', '/yf-proxy'),
    });
  } else if (typeof window === 'undefined') {
    baseList.push({ name: 'direct-node', buildUrl: (u: string) => u });
  }

  // Reordenar colocando primero el último proxy exitoso si existe en la lista actual
  const providers: CorsProxyProvider[] = lastSuccessfulProxyName
    ? [
        ...baseList.filter((p) => p.name === lastSuccessfulProxyName),
        ...baseList.filter((p) => p.name !== lastSuccessfulProxyName),
      ]
    : baseList;

  const attemptErrors: string[] = [];

  for (const provider of providers) {
    if (options.signal?.aborted) {
      throw new DOMException('Operación cancelada por el usuario.', 'AbortError');
    }

    const requestUrl = provider.buildUrl(targetUrl);
    const localController = new AbortController();
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      localController.abort();
    }, timeoutMs);

    const onExternalAbort = () => {
      localController.abort();
    };
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: localController.signal,
      });

      if (!response.ok) {
        attemptErrors.push(`${provider.name}: HTTP ${response.status}`);
        continue;
      }

      const text = await response.text();
      let rawJson: unknown;
      try {
        rawJson = JSON.parse(text);
      } catch {
        attemptErrors.push(`${provider.name}: respuesta no JSON`);
        continue;
      }

      // Desempaquetar formato { contents: "..." } usado por api.allorigins.win/get
      let parsed: RawYahooChartPayload | null = null;
      if (
        rawJson &&
        typeof rawJson === 'object' &&
        'contents' in rawJson &&
        typeof (rawJson as { contents: unknown }).contents === 'string'
      ) {
        try {
          parsed = JSON.parse(
            (rawJson as { contents: string }).contents
          ) as RawYahooChartPayload;
        } catch {
          attemptErrors.push(`${provider.name}: contenido interno inválido`);
          continue;
        }
      } else {
        parsed = rawJson as RawYahooChartPayload;
      }

      if (!parsed || typeof parsed !== 'object' || !parsed.chart) {
        attemptErrors.push(`${provider.name}: estructura Yahoo inválida`);
        continue;
      }

      lastSuccessfulProxyName = provider.name;
      return { data: parsed, proxyUsed: provider.name };
    } catch (err: unknown) {
      if (options.signal?.aborted) {
        throw new DOMException('Operación cancelada por el usuario.', 'AbortError');
      }
      if (timedOut) {
        attemptErrors.push(`${provider.name}: timeout (${timeoutMs}ms)`);
      } else {
        const message = err instanceof Error ? err.message : 'Error de red';
        attemptErrors.push(`${provider.name}: ${message}`);
      }
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  throw new Error(
    `Todos los proxies CORS fallaron (${attemptErrors.join(' | ')})`
  );
}

/**
 * Descarga las series históricas OHLCV reales para un ticker individual desde Yahoo Finance.
 */
export async function fetchYahooCandles(
  ticker: string,
  timeframe: Timeframe,
  options: YahooServiceOptions & { signal?: AbortSignal } = {}
): Promise<YahooChartResponse> {
  const { interval, range } = mapTimeframeToYahooParams(timeframe);
  const targetUrl = `${YAHOO_BASE_URL}/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false`;

  const { data, proxyUsed } = await fetchWithFallback(targetUrl, {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    proxies: options.proxies,
    signal: options.signal,
  });

  return parseYahooChartPayload(data, ticker, timeframe, proxyUsed);
}

/**
 * Procesa un mercado completo en lotes controlados de 6 tickers simultáneos
 * con pausa de 300ms entre lotes y soporte de cancelación instantánea via AbortSignal.
 */
export async function fetchMarketBatch(
  tickers: string[],
  _market: MarketId,
  timeframe: Timeframe,
  onProgress?: (update: BatchProgressUpdate) => void,
  signal?: AbortSignal,
  options: YahooServiceOptions = {}
): Promise<{
  results: YahooChartResponse[];
  incidents: NetworkIncident[];
  aborted: boolean;
}> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const batchDelayMs = options.batchDelayMs ?? DEFAULT_BATCH_DELAY_MS;

  const total = tickers.length;
  const results: YahooChartResponse[] = [];
  const incidents: NetworkIncident[] = [];
  let processed = 0;

  for (let i = 0; i < total; i += batchSize) {
    if (signal?.aborted) {
      return { results, incidents, aborted: true };
    }

    const chunk = tickers.slice(i, i + batchSize);

    await Promise.all(
      chunk.map(async (ticker) => {
        if (signal?.aborted) return;

        try {
          const response = await fetchYahooCandles(ticker, timeframe, {
            ...options,
            signal,
          });
          if (signal?.aborted) return;

          results.push(response);
          processed += 1;

          onProgress?.({
            processed,
            total,
            incidents: incidents.length,
            latestResult: response,
          });
        } catch (err: unknown) {
          if (
            signal?.aborted ||
            (err instanceof DOMException && err.name === 'AbortError')
          ) {
            return;
          }

          const incident: NetworkIncident = {
            ticker,
            message: err instanceof Error ? err.message : 'Error desconocido de red',
            timestamp: new Date().toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          };

          incidents.push(incident);
          processed += 1;

          onProgress?.({
            processed,
            total,
            incidents: incidents.length,
            latestError: incident,
          });
        }
      })
    );

    if (signal?.aborted) {
      return { results, incidents, aborted: true };
    }

    // Pausa controlada entre lotes para evitar bloqueos HTTP 429 en S&P 500
    if (i + batchSize < total) {
      try {
        await delayWithSignal(batchDelayMs, signal);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return { results, incidents, aborted: true };
        }
        throw err;
      }
    }
  }

  return { results, incidents, aborted: false };
}
