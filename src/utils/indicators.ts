import type {
  BacktestSmaSummary,
  OHLCVCandle,
  PullbackBacktestStats,
  SmaDiagnostics,
  SmaEvaluationOutput,
} from '../types/market';

export const SMA_SHORT_PERIOD = 50;
export const SMA_LONG_PERIOD = 200;
export const SMA_HISTORY_LOOKBACK = 15;
export const BOUNCE_TOUCH_TOLERANCE = 1.002;
export const RSI_DEFAULT_PERIOD = 14;
export const ATR_DEFAULT_PERIOD = 14;

/**
 * Configuración para la evaluación de estrategias de pullback sobre SMA 50 y SMA 200.
 */
export interface PullbackEngineConfig {
  /** Tolerancia porcentual para el Modo A (Zona de Proximidad), por defecto 1.5 (%) */
  proximityThresholdPct: number;
  /** Periodo corto de media móvil simple (por defecto 50) */
  shortPeriod?: number;
  /** Periodo largo de media móvil simple (por defecto 200) */
  longPeriod?: number;
}

/**
 * Filtra velas incompletas o con valores nulos/inválidos en close, high, low u open.
 */
export function sanitizeCandles(candles: OHLCVCandle[]): OHLCVCandle[] {
  return candles.filter(
    (c) =>
      c != null &&
      typeof c.timestamp === 'number' &&
      Number.isFinite(c.timestamp) &&
      typeof c.open === 'number' &&
      Number.isFinite(c.open) &&
      c.open > 0 &&
      typeof c.high === 'number' &&
      Number.isFinite(c.high) &&
      c.high > 0 &&
      typeof c.low === 'number' &&
      Number.isFinite(c.low) &&
      c.low > 0 &&
      typeof c.close === 'number' &&
      Number.isFinite(c.close) &&
      c.close > 0 &&
      c.high >= c.low
  );
}

/**
 * Calcula la Media Móvil Simple (SMA) sobre un arreglo de cierres para un desplazamiento
 * hacia atrás (`offsetFromEnd = 0` corresponde a la vela actual).
 */
export function calculateSMAAtOffset(
  closes: number[],
  period: number,
  offsetFromEnd = 0
): number | null {
  const endIndex = closes.length - offsetFromEnd;
  if (period <= 0 || endIndex < period || offsetFromEnd < 0) {
    return null;
  }

  let sum = 0;
  for (let i = endIndex - period; i < endIndex; i++) {
    sum += closes[i];
  }
  return sum / period;
}

/**
 * Calcula la SMA actual (`offset = 0`) para el periodo indicado.
 */
export function calculateSMA(closes: number[], period: number): number | null {
  return calculateSMAAtOffset(closes, period, 0);
}

/**
 * Calcula la serie completa O(n) de SMA usando sumas prefijas para gráficos y backtest.
 */
export function calculateSMASeries(
  closes: number[],
  period: number
): Array<number | null> {
  const n = closes.length;
  const result: Array<number | null> = new Array(n).fill(null);
  if (period <= 0 || n < period) {
    return result;
  }

  let rollingSum = 0;
  for (let i = 0; i < n; i++) {
    rollingSum += closes[i];
    if (i >= period) {
      rollingSum -= closes[i - period];
    }
    if (i >= period - 1) {
      result[i] = rollingSum / period;
    }
  }
  return result;
}

/**
 * Calcula la SMA actual y la de las últimas `lookback` velas (por defecto 15),
 * devolviendo un arreglo indexado por `offsetFromEnd` (`0` = actual, `15` = hace 15 velas).
 */
export function calculateSMALastCandles(
  closes: number[],
  period: number,
  lookback = SMA_HISTORY_LOOKBACK
): Array<number | null> {
  const series: Array<number | null> = [];
  for (let offset = 0; offset <= lookback; offset++) {
    series.push(calculateSMAAtOffset(closes, period, offset));
  }
  return series;
}

/**
 * Calcula la serie completa de RSI (14) usando el suavizado clásico de Wilder.
 */
export function calculateRSISeries(
  closes: number[],
  period = RSI_DEFAULT_PERIOD
): Array<number | null> {
  const n = closes.length;
  const result: Array<number | null> = new Array(n).fill(null);
  if (period <= 0 || n <= period) {
    return result;
  }

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      gainSum += diff;
    } else {
      lossSum += Math.abs(diff);
    }
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }

  return result;
}

/**
 * Calcula el último RSI (14) disponible.
 */
export function calculateRSI14(
  closes: number[],
  period = RSI_DEFAULT_PERIOD
): number | null {
  const series = calculateRSISeries(closes, period);
  return series.length > 0 ? series[series.length - 1] : null;
}

/**
 * Calcula el ATR (14) de Wilder sobre velas OHLC válidas.
 */
export function calculateATR14(
  validCandles: OHLCVCandle[],
  period = ATR_DEFAULT_PERIOD
): number | null {
  const n = validCandles.length;
  if (period <= 0 || n <= period) {
    return null;
  }

  const trueRanges: number[] = new Array(n).fill(0);
  trueRanges[0] = validCandles[0].high - validCandles[0].low;
  for (let i = 1; i < n; i++) {
    const cur = validCandles[i];
    const prevClose = validCandles[i - 1].close;
    trueRanges[i] = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose)
    );
  }

  let trSum = 0;
  for (let i = 1; i <= period; i++) {
    trSum += trueRanges[i];
  }
  let atr = trSum / period;

  for (let i = period + 1; i < n; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

function emptyBacktestSummary(): BacktestSmaSummary {
  return {
    eventsCount: 0,
    winRate5Pct: null,
    avgReturn5Pct: null,
    winRate10Pct: null,
    avgReturn10Pct: null,
  };
}

/**
 * Backtest histórico rápido sobre las velas ya descargadas (sin peticiones extra).
 * Detecta eventos pasados de Modo B (Toque y Rebote Estricto) y mide tasa de acierto y
 * retorno medio a +5 y +10 velas con enfriamiento de 5 velas para evitar solapamientos.
 */
function backtestSingleSma(
  validCandles: OHLCVCandle[],
  closes: number[],
  period: number
): BacktestSmaSummary {
  const n = validCandles.length;
  const minIndex = period + SMA_HISTORY_LOOKBACK;
  const maxIndex = n - 11;
  if (maxIndex < minIndex) {
    return emptyBacktestSummary();
  }

  const smaSeries = calculateSMASeries(closes, period);
  const returns5: number[] = [];
  const returns10: number[] = [];
  let lastSignalIndex = -100;

  for (let i = minIndex; i <= maxIndex; i++) {
    if (i - lastSignalIndex < 5) {
      continue;
    }

    const smaCur = smaSeries[i];
    const smaPrev = smaSeries[i - 1];
    if (smaCur === null || smaCur <= 0 || smaPrev === null || smaPrev <= 0) {
      continue;
    }

    let checked = 0;
    let aboveCount = 0;
    for (let offset = 5; offset <= 15; offset++) {
      const idx = i - offset;
      const smaAtOffset = smaSeries[idx];
      if (idx >= 0 && smaAtOffset !== null && smaAtOffset > 0) {
        checked += 1;
        if (validCandles[idx].close > smaAtOffset) {
          aboveCount += 1;
        }
      }
    }

    const wasAbove = checked > 0 && aboveCount >= Math.ceil(checked * 0.6);
    if (!wasAbove) continue;

    const cur = validCandles[i];
    const prev = validCandles[i - 1];
    const touched =
      cur.low <= smaCur * BOUNCE_TOUCH_TOLERANCE ||
      prev.low <= smaPrev * BOUNCE_TOUCH_TOLERANCE;
    if (!touched || cur.close <= smaCur) {
      continue;
    }

    const ret5 = ((validCandles[i + 5].close - cur.close) / cur.close) * 100;
    const ret10 = ((validCandles[i + 10].close - cur.close) / cur.close) * 100;
    returns5.push(ret5);
    returns10.push(ret10);
    lastSignalIndex = i;
  }

  if (returns5.length === 0) {
    return emptyBacktestSummary();
  }

  const wins5 = returns5.filter((r) => r > 0).length;
  const wins10 = returns10.filter((r) => r > 0).length;
  const avg5 = returns5.reduce((a, b) => a + b, 0) / returns5.length;
  const avg10 = returns10.reduce((a, b) => a + b, 0) / returns10.length;

  return {
    eventsCount: returns5.length,
    winRate5Pct: (wins5 / returns5.length) * 100,
    avgReturn5Pct: avg5,
    winRate10Pct: (wins10 / returns10.length) * 100,
    avgReturn10Pct: avg10,
  };
}

export function runPullbackBacktest(
  validCandles: OHLCVCandle[],
  shortPeriod = SMA_SHORT_PERIOD,
  longPeriod = SMA_LONG_PERIOD
): PullbackBacktestStats {
  if (validCandles.length < shortPeriod + SMA_HISTORY_LOOKBACK + 11) {
    return {
      evaluatedBars: validCandles.length,
      sma50: emptyBacktestSummary(),
      sma200: emptyBacktestSummary(),
    };
  }

  const closes = validCandles.map((c) => c.close);
  return {
    evaluatedBars: validCandles.length,
    sma50: backtestSingleSma(validCandles, closes, shortPeriod),
    sma200: backtestSingleSma(validCandles, closes, longPeriod),
  };
}

function emptyDiagnostics(): SmaDiagnostics {
  return {
    smaCurrent: null,
    sma10Ago: null,
    smaLast16: [],
    slopePositiveOrFlat: false,
    wasAboveIn5To15: false,
    touchedRecently: false,
    closedStrictlyAbove: false,
    distancePct: null,
  };
}

/**
 * Evalúa las reglas matemáticas de Modo A (Zona de Proximidad) y Modo B (Toque y Rebote Estricto)
 * para una media móvil simple de periodo `period`.
 */
function evaluateSingleSma(
  validCandles: OHLCVCandle[],
  closes: number[],
  period: number,
  proximityThresholdPct: number
): {
  diagnostics: SmaDiagnostics;
  proximityMatch: boolean;
  bounceMatch: boolean;
} {
  // Validación estricta de tamaño mínimo requerido para el periodo (50 o 200 velas válidas)
  if (validCandles.length < period) {
    return {
      diagnostics: emptyDiagnostics(),
      proximityMatch: false,
      bounceMatch: false,
    };
  }

  const smaLast16 = calculateSMALastCandles(closes, period, SMA_HISTORY_LOOKBACK);
  const smaCurrent = smaLast16[0] ?? null;
  const sma10Ago = smaLast16[10] ?? null;

  if (smaCurrent === null || smaCurrent <= 0) {
    return {
      diagnostics: emptyDiagnostics(),
      proximityMatch: false,
      bounceMatch: false,
    };
  }

  const n = validCandles.length;
  const currentCandle = validCandles[n - 1];
  const prevCandle = n >= 2 ? validCandles[n - 2] : null;
  const currentClose = currentCandle.close;

  // Pendiente de la SMA: SMA actual >= SMA hace 10 velas
  const slopePositiveOrFlat = sma10Ago !== null && smaCurrent >= sma10Ago;

  // Verificación de contexto previo: el precio hace 5-15 velas cotizaba por encima de dicha media.
  // Se exige que la mayoría de velas válidas en la ventana [5..15] cerraran por encima de su SMA.
  let checkedOffsets = 0;
  let aboveCount = 0;
  for (let offset = 5; offset <= 15; offset++) {
    const candleIndex = n - 1 - offset;
    const smaAtOffset = smaLast16[offset];
    if (candleIndex >= 0 && smaAtOffset !== null && smaAtOffset > 0) {
      checkedOffsets += 1;
      if (validCandles[candleIndex].close > smaAtOffset) {
        aboveCount += 1;
      }
    }
  }
  const wasAboveIn5To15 =
    checkedOffsets > 0 && aboveCount >= Math.ceil(checkedOffsets * 0.6);

  // Distancia porcentual actual: ((PrecioActual - SMA) / SMA) * 100
  const distancePct = ((currentClose - smaCurrent) / smaCurrent) * 100;
  const absThreshold = Math.abs(proximityThresholdPct);

  // Modo A — Zona de Proximidad:
  // Pendiente >= 0 (SMA actual >= SMA hace 10 velas) + precio hace 5-15 velas > SMA + cercanía dentro [-umbral%, +umbral%]
  const proximityMatch =
    slopePositiveOrFlat &&
    wasAboveIn5To15 &&
    distancePct >= -absThreshold &&
    distancePct <= absThreshold;

  // Modo B — Toque y Rebote Estricto:
  // Toque: Low de vela actual o inmediatamente anterior <= SMA * 1.002 (con SMA correspondiente)
  const smaPrev = smaLast16[1] ?? smaCurrent;
  const touchedCurrent = currentCandle.low <= smaCurrent * BOUNCE_TOUCH_TOLERANCE;
  const touchedPrev =
    prevCandle !== null && smaPrev !== null && prevCandle.low <= smaPrev * BOUNCE_TOUCH_TOLERANCE;
  const touchedRecently = touchedCurrent || touchedPrev;

  // Rebote: Close actual cotiza estrictamente por encima de la SMA actual
  const closedStrictlyAbove = currentClose > smaCurrent;

  const bounceMatch =
    wasAboveIn5To15 && touchedRecently && closedStrictlyAbove;

  return {
    diagnostics: {
      smaCurrent,
      sma10Ago,
      smaLast16,
      slopePositiveOrFlat,
      wasAboveIn5To15,
      touchedRecently,
      closedStrictlyAbove,
      distancePct,
    },
    proximityMatch,
    bounceMatch,
  };
}

/**
 * Motor matemático completo de evaluación de pullbacks sobre SMA 50/200, RSI(14), ATR(14),
 * Golden Cross y Backtest rápido sobre velas descargadas.
 */
export function evaluatePullbackSignals(
  candles: OHLCVCandle[],
  config: PullbackEngineConfig
): SmaEvaluationOutput {
  const validCandles = sanitizeCandles(candles);

  if (validCandles.length === 0) {
    return {
      validCandlesCount: 0,
      sma50: null,
      sma200: null,
      distanceSma50Pct: null,
      distanceSma200Pct: null,
      proximityMatch50: false,
      proximityMatch200: false,
      bounceMatch50: false,
      bounceMatch200: false,
      diagnostics50: emptyDiagnostics(),
      diagnostics200: emptyDiagnostics(),
      rsi14: null,
      atr14: null,
      atrDistance50: null,
      atrDistance200: null,
      isGoldenCross: false,
      backtest: {
        evaluatedBars: 0,
        sma50: emptyBacktestSummary(),
        sma200: emptyBacktestSummary(),
      },
    };
  }

  const shortPeriod = config.shortPeriod ?? SMA_SHORT_PERIOD;
  const longPeriod = config.longPeriod ?? SMA_LONG_PERIOD;
  const closes = validCandles.map((c) => c.close);
  const currentClose = closes[closes.length - 1];

  const eval50 = evaluateSingleSma(
    validCandles,
    closes,
    shortPeriod,
    config.proximityThresholdPct
  );
  const eval200 = evaluateSingleSma(
    validCandles,
    closes,
    longPeriod,
    config.proximityThresholdPct
  );

  const rsi14 = calculateRSI14(closes, RSI_DEFAULT_PERIOD);
  const atr14 = calculateATR14(validCandles, ATR_DEFAULT_PERIOD);

  const sma50 = eval50.diagnostics.smaCurrent;
  const sma200 = eval200.diagnostics.smaCurrent;

  const atrDistance50 =
    atr14 !== null && atr14 > 0 && sma50 !== null ? (currentClose - sma50) / atr14 : null;
  const atrDistance200 =
    atr14 !== null && atr14 > 0 && sma200 !== null ? (currentClose - sma200) / atr14 : null;

  const isGoldenCross = sma50 !== null && sma200 !== null && sma50 > sma200;
  const backtest = runPullbackBacktest(validCandles, shortPeriod, longPeriod);

  return {
    validCandlesCount: validCandles.length,
    sma50,
    sma200,
    distanceSma50Pct: eval50.diagnostics.distancePct,
    distanceSma200Pct: eval200.diagnostics.distancePct,
    proximityMatch50: eval50.proximityMatch,
    proximityMatch200: eval200.proximityMatch,
    bounceMatch50: eval50.bounceMatch,
    bounceMatch200: eval200.bounceMatch,
    diagnostics50: eval50.diagnostics,
    diagnostics200: eval200.diagnostics,
    rsi14,
    atr14,
    atrDistance50,
    atrDistance200,
    isGoldenCross,
    backtest,
  };
}
