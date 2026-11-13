import type {
  OHLCVCandle,
  SmaDiagnostics,
  SmaEvaluationOutput,
} from '../types/market';

export const SMA_SHORT_PERIOD = 50;
export const SMA_LONG_PERIOD = 200;
export const SMA_HISTORY_LOOKBACK = 15;
export const BOUNCE_TOUCH_TOLERANCE = 1.002;

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
 * Motor matemático completo de evaluación de pullbacks sobre SMA 50 y SMA 200.
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
    };
  }

  const shortPeriod = config.shortPeriod ?? SMA_SHORT_PERIOD;
  const longPeriod = config.longPeriod ?? SMA_LONG_PERIOD;
  const closes = validCandles.map((c) => c.close);

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

  return {
    validCandlesCount: validCandles.length,
    sma50: eval50.diagnostics.smaCurrent,
    sma200: eval200.diagnostics.smaCurrent,
    distanceSma50Pct: eval50.diagnostics.distancePct,
    distanceSma200Pct: eval200.diagnostics.distancePct,
    proximityMatch50: eval50.proximityMatch,
    proximityMatch200: eval200.proximityMatch,
    bounceMatch50: eval50.bounceMatch,
    bounceMatch200: eval200.bounceMatch,
    diagnostics50: eval50.diagnostics,
    diagnostics200: eval200.diagnostics,
  };
}
