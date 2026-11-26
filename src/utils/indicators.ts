import type {
  BacktestSmaSummary,
  OHLCVCandle,
  PullbackBacktestStats,
  SmaDiagnostics,
  SmaEvaluationOutput,
  StatHorizon,
  StatModelOption,
  StatisticalBounceAnalysis,
  StatisticalHorizonStats,
} from '../types/market';

export const SMA_SHORT_PERIOD = 50;
export const SMA_LONG_PERIOD = 200;
export const SMA_HISTORY_LOOKBACK = 15;
export const BOUNCE_TOUCH_TOLERANCE = 1.002;
export const RSI_DEFAULT_PERIOD = 14;
export const ATR_DEFAULT_PERIOD = 14;
export const MACD_FAST_PERIOD = 12;
export const MACD_SLOW_PERIOD = 26;
export const MACD_SIGNAL_PERIOD = 9;

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
 * Calcula la Media Móvil Exponencial (EMA) inicializada con SMA sobre los primeros `period` valores.
 */
export function calculateEMASeries(
  values: number[],
  period: number
): Array<number | null> {
  const n = values.length;
  const result: Array<number | null> = new Array(n).fill(null);
  if (period <= 0 || n < period) {
    return result;
  }

  let seedSum = 0;
  for (let i = 0; i < period; i++) {
    seedSum += values[i];
  }
  let ema = seedSum / period;
  result[period - 1] = ema;

  const multiplier = 2 / (period + 1);
  for (let i = period; i < n; i++) {
    ema = (values[i] - ema) * multiplier + ema;
    result[i] = ema;
  }
  return result;
}

export interface MacdSeriesOutput {
  macdLine: Array<number | null>;
  signalLine: Array<number | null>;
  histogram: Array<number | null>;
}

/**
 * Calcula las series completas de MACD (12, 26, 9): Línea MACD, Línea Señal e Histograma.
 */
export function calculateMACDSeries(
  closes: number[],
  fastPeriod = MACD_FAST_PERIOD,
  slowPeriod = MACD_SLOW_PERIOD,
  signalPeriod = MACD_SIGNAL_PERIOD
): MacdSeriesOutput {
  const n = closes.length;
  const macdLine: Array<number | null> = new Array(n).fill(null);
  const signalLine: Array<number | null> = new Array(n).fill(null);
  const histogram: Array<number | null> = new Array(n).fill(null);

  if (n < slowPeriod + signalPeriod) {
    return { macdLine, signalLine, histogram };
  }

  const emaFast = calculateEMASeries(closes, fastPeriod);
  const emaSlow = calculateEMASeries(closes, slowPeriod);

  const validMacdValues: number[] = [];
  const validMacdIndexes: number[] = [];

  for (let i = 0; i < n; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f !== null && s !== null) {
      const diff = f - s;
      macdLine[i] = diff;
      validMacdValues.push(diff);
      validMacdIndexes.push(i);
    }
  }

  const signalOnValid = calculateEMASeries(validMacdValues, signalPeriod);
  for (let j = 0; j < validMacdIndexes.length; j++) {
    const origIdx = validMacdIndexes[j];
    const sig = signalOnValid[j];
    const macdVal = macdLine[origIdx];
    if (sig !== null && macdVal !== null) {
      signalLine[origIdx] = sig;
      histogram[origIdx] = macdVal - sig;
    }
  }

  return { macdLine, signalLine, histogram };
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

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Función de distribución acumulada normal estándar Φ(x) mediante aproximación de Abramowitz & Stegun.
 */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * absX);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t) *
      Math.exp(-absX * absX);
  return 0.5 * (1 + sign * y);
}

/**
 * Cota inferior del intervalo de confianza de Wilson al 95% (z = 1.96) expresada en porcentaje.
 */
export function wilsonLowerBoundPct(
  wins: number,
  sampleSize: number,
  z = 1.96
): number {
  if (sampleSize <= 0) return 0;
  const p = clamp(wins / sampleSize, 0, 1);
  const z2 = z * z;
  const denom = 1 + z2 / sampleSize;
  const center = p + z2 / (2 * sampleSize);
  const margin =
    z * Math.sqrt((p * (1 - p) + z2 / (4 * sampleSize)) / sampleSize);
  return clamp(((center - margin) / denom) * 100, 0, 100);
}

function emptyHorizonStats(horizonBars: StatHorizon): StatisticalHorizonStats {
  return {
    horizonBars,
    sampleSize: 0,
    winsCount: 0,
    empiricalWinRatePct: null,
    bayesianProbPct: 50,
    wilsonLower95Pct: 0,
    avgReturnPct: null,
  };
}

export function emptyStatisticalBounce(): StatisticalBounceAnalysis {
  return {
    zScore20: null,
    zScoreReversionProbPct: 50,
    supportConfirmationProbPct: 50,
    volatility20Pct: null,
    horizon3: emptyHorizonStats(3),
    horizon5: emptyHorizonStats(5),
    horizon10: emptyHorizonStats(10),
    compositeProb3Pct: 50,
    compositeProb5Pct: 50,
    compositeProb10Pct: 50,
    confidenceLabel: 'BAJA',
  };
}

function evaluateHorizonConditional(
  closes: number[],
  sma50Series: Array<number | null>,
  sma20Series: Array<number | null>,
  rsiSeries: Array<number | null>,
  horizonBars: StatHorizon
): StatisticalHorizonStats {
  const n = closes.length;
  const startIdx = n >= 65 ? 50 : 20;
  const endIdx = n - 1 - horizonBars;
  if (endIdx < startIdx) {
    return emptyHorizonStats(horizonBars);
  }

  let sampleSize = 0;
  let winsCount = 0;
  let returnSum = 0;

  for (let i = startIdx; i <= endIdx; i++) {
    const c = closes[i];
    const s50 = sma50Series[i];
    const s20 = sma20Series[i];
    const r14 = rsiSeries[i];

    const nearSma50 = s50 !== null && s50 > 0 && Math.abs((c - s50) / s50) <= 0.03;
    const belowSma20 = s20 !== null && s20 > 0 && c < s20;
    const rsiPullback = r14 !== null && r14 <= 50;

    if (nearSma50 || belowSma20 || rsiPullback) {
      const fwdRetPct = ((closes[i + horizonBars] - c) / c) * 100;
      sampleSize += 1;
      if (fwdRetPct > 0) {
        winsCount += 1;
      }
      returnSum += fwdRetPct;
    }
  }

  const empiricalWinRatePct =
    sampleSize > 0 ? (winsCount / sampleSize) * 100 : null;
  // Posterior Bayesiano Beta(2, 2) centrado en prior neutro 50%
  const bayesianProbPct = ((winsCount + 2) / (sampleSize + 4)) * 100;
  const wilsonLower95 = wilsonLowerBoundPct(winsCount, sampleSize, 1.96);
  const avgReturnPct = sampleSize > 0 ? returnSum / sampleSize : null;

  return {
    horizonBars,
    sampleSize,
    winsCount,
    empiricalWinRatePct,
    bayesianProbPct,
    wilsonLower95Pct: wilsonLower95,
    avgReturnPct,
  };
}

export function calculateStatisticalBounceAnalysis(
  validCandles: OHLCVCandle[],
  closes: number[],
  sma50: number | null,
  sma200: number | null,
  slope50Positive: boolean,
  rsi14: number | null,
  isMacdBullishCross: boolean,
  curMacdHist: number | null,
  prevMacdHist: number | null
): StatisticalBounceAnalysis {
  const n = closes.length;
  if (n < 21) {
    return emptyStatisticalBounce();
  }

  // Z-Score de 20 velas y volatilidad logarítmica
  const win20 = closes.slice(-20);
  const mean20 = win20.reduce((acc, v) => acc + v, 0) / 20;
  const variance20 =
    win20.reduce((acc, v) => acc + (v - mean20) * (v - mean20), 0) / 19;
  const std20 = Math.sqrt(variance20);
  const currentClose = closes[n - 1];
  const zScore20 = std20 > 1e-12 ? (currentClose - mean20) / std20 : 0;
  const zScoreReversionProbPct = clamp(normalCdf(-zScore20) * 100, 5, 95);

  const logReturns: number[] = [];
  for (let i = n - 20; i < n; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  let volatility20Pct: number | null = null;
  if (logReturns.length >= 2) {
    const lrMean =
      logReturns.reduce((acc, v) => acc + v, 0) / logReturns.length;
    const lrVar =
      logReturns.reduce((acc, v) => acc + (v - lrMean) * (v - lrMean), 0) /
      (logReturns.length - 1);
    volatility20Pct = Math.sqrt(lrVar) * 100;
  }

  // Volumen relativo de la última vela
  const recentVols = validCandles
    .slice(-21, -1)
    .map((c) => c.volume)
    .filter((v) => v > 0);
  const avgVol =
    recentVols.length > 0
      ? recentVols.reduce((acc, v) => acc + v, 0) / recentVols.length
      : 0;
  const lastVol = validCandles[n - 1].volume;
  const volRatio = avgVol > 0 && lastVol > 0 ? lastVol / avgVol : 1;

  // Probabilidad logística de soporte técnico y momentum
  let logit = 0;
  if (sma50 !== null && sma50 > 0) {
    const d50 = ((currentClose - sma50) / sma50) * 100;
    logit += slope50Positive ? 0.35 : -0.25;
    if (d50 >= -2.5 && d50 <= 2.5) {
      logit += 0.45;
    } else if (d50 < -5.0) {
      logit += 0.15;
    } else if (d50 > 5.0) {
      logit -= 0.3;
    }
  }
  if (sma200 !== null && sma200 > 0) {
    const d200 = ((currentClose - sma200) / sma200) * 100;
    if (currentClose > sma200) logit += 0.25;
    if (Math.abs(d200) <= 2.5) logit += 0.35;
  }
  if (rsi14 !== null) {
    if (rsi14 <= 35) logit += 0.55;
    else if (rsi14 <= 50) logit += 0.3;
    else if (rsi14 >= 70) logit -= 0.55;
  }
  if (isMacdBullishCross) {
    logit += 0.65;
  } else if (
    curMacdHist !== null &&
    prevMacdHist !== null &&
    curMacdHist > prevMacdHist
  ) {
    logit += 0.3;
  } else if (
    curMacdHist !== null &&
    curMacdHist < 0 &&
    prevMacdHist !== null &&
    curMacdHist < prevMacdHist
  ) {
    logit -= 0.2;
  }
  if (volRatio >= 1.2) {
    logit += 0.2;
  }

  const supportConfirmationProbPct = clamp(
    (1 / (1 + Math.exp(-logit))) * 100,
    12,
    92
  );

  const sma50Series = calculateSMASeries(closes, SMA_SHORT_PERIOD);
  const sma20Series = calculateSMASeries(closes, 20);
  const rsiSeries = calculateRSISeries(closes, RSI_DEFAULT_PERIOD);

  const horizon3 = evaluateHorizonConditional(
    closes,
    sma50Series,
    sma20Series,
    rsiSeries,
    3
  );
  const horizon5 = evaluateHorizonConditional(
    closes,
    sma50Series,
    sma20Series,
    rsiSeries,
    5
  );
  const horizon10 = evaluateHorizonConditional(
    closes,
    sma50Series,
    sma20Series,
    rsiSeries,
    10
  );

  const combine = (bayesPct: number) =>
    clamp(
      0.45 * bayesPct +
        0.25 * zScoreReversionProbPct +
        0.3 * supportConfirmationProbPct,
      5,
      95
    );

  const compositeProb3Pct = combine(horizon3.bayesianProbPct);
  const compositeProb5Pct = combine(horizon5.bayesianProbPct);
  const compositeProb10Pct = combine(horizon10.bayesianProbPct);

  let confidenceLabel: StatisticalBounceAnalysis['confidenceLabel'] = 'BAJA';
  if (horizon5.sampleSize >= 20 && compositeProb5Pct >= 65) {
    confidenceLabel = 'ALTA';
  } else if (horizon5.sampleSize >= 10 && compositeProb5Pct >= 55) {
    confidenceLabel = 'MEDIA';
  } else if (horizon5.sampleSize >= 5) {
    confidenceLabel = 'MODERADA';
  }

  return {
    zScore20,
    zScoreReversionProbPct,
    supportConfirmationProbPct,
    volatility20Pct,
    horizon3,
    horizon5,
    horizon10,
    compositeProb3Pct,
    compositeProb5Pct,
    compositeProb10Pct,
    confidenceLabel,
  };
}

export function getStatisticalHorizonStats(
  stats: StatisticalBounceAnalysis,
  horizon: StatHorizon
): StatisticalHorizonStats {
  if (horizon === 3) return stats.horizon3;
  if (horizon === 10) return stats.horizon10;
  return stats.horizon5;
}

export function getStatisticalProbabilityPct(
  stats: StatisticalBounceAnalysis,
  model: StatModelOption,
  horizon: StatHorizon
): number {
  const hStats = getStatisticalHorizonStats(stats, horizon);
  switch (model) {
    case 'EMPIRICAL':
      return hStats.bayesianProbPct;
    case 'ZSCORE':
      return stats.zScoreReversionProbPct;
    case 'WILSON_95':
      return hStats.wilsonLower95Pct;
    case 'COMPOSITE':
    default:
      if (horizon === 3) return stats.compositeProb3Pct;
      if (horizon === 10) return stats.compositeProb10Pct;
      return stats.compositeProb5Pct;
  }
}

export function getStatisticalExpectedReturnPct(
  stats: StatisticalBounceAnalysis,
  horizon: StatHorizon
): number | null {
  return getStatisticalHorizonStats(stats, horizon).avgReturnPct;
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

  const slopePositiveOrFlat = sma10Ago !== null && smaCurrent >= sma10Ago;

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

  const distancePct = ((currentClose - smaCurrent) / smaCurrent) * 100;
  const absThreshold = Math.abs(proximityThresholdPct);

  const proximityMatch =
    slopePositiveOrFlat &&
    wasAboveIn5To15 &&
    distancePct >= -absThreshold &&
    distancePct <= absThreshold;

  const smaPrev = smaLast16[1] ?? smaCurrent;
  const touchedCurrent = currentCandle.low <= smaCurrent * BOUNCE_TOUCH_TOLERANCE;
  const touchedPrev =
    prevCandle !== null && smaPrev !== null && prevCandle.low <= smaPrev * BOUNCE_TOUCH_TOLERANCE;
  const touchedRecently = touchedCurrent || touchedPrev;

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
 * MACD(12,26,9), Golden Cross y Backtest rápido sobre velas descargadas.
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
      macdPullbackMatch50: false,
      macdPullbackMatch200: false,
      diagnostics50: emptyDiagnostics(),
      diagnostics200: emptyDiagnostics(),
      rsi14: null,
      atr14: null,
      atrDistance50: null,
      atrDistance200: null,
      macdLine: null,
      macdSignal: null,
      macdHistogram: null,
      isMacdBullishCross: false,
      isMacdBullish: false,
      isGoldenCross: false,
      backtest: {
        evaluatedBars: 0,
        sma50: emptyBacktestSummary(),
        sma200: emptyBacktestSummary(),
      },
      statisticalBounce: emptyStatisticalBounce(),
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

  const macdSeries = calculateMACDSeries(
    closes,
    MACD_FAST_PERIOD,
    MACD_SLOW_PERIOD,
    MACD_SIGNAL_PERIOD
  );
  const n = closes.length;
  const macdLine = n >= 1 ? macdSeries.macdLine[n - 1] : null;
  const macdSignal = n >= 1 ? macdSeries.signalLine[n - 1] : null;
  const macdHistogram = n >= 1 ? macdSeries.histogram[n - 1] : null;
  const prevMacd = n >= 2 ? macdSeries.macdLine[n - 2] : null;
  const prevSignal = n >= 2 ? macdSeries.signalLine[n - 2] : null;

  const isMacdBullishCross =
    macdLine !== null &&
    macdSignal !== null &&
    prevMacd !== null &&
    prevSignal !== null &&
    prevMacd <= prevSignal &&
    macdLine > macdSignal;
  const isMacdBullish =
    macdLine !== null && macdSignal !== null && macdLine > macdSignal;

  const macdPullbackMatch50 =
    (eval50.proximityMatch || eval50.bounceMatch) && isMacdBullishCross;
  const macdPullbackMatch200 =
    (eval200.proximityMatch || eval200.bounceMatch) && isMacdBullishCross;

  const sma50 = eval50.diagnostics.smaCurrent;
  const sma200 = eval200.diagnostics.smaCurrent;

  const atrDistance50 =
    atr14 !== null && atr14 > 0 && sma50 !== null ? (currentClose - sma50) / atr14 : null;
  const atrDistance200 =
    atr14 !== null && atr14 > 0 && sma200 !== null ? (currentClose - sma200) / atr14 : null;

  const isGoldenCross = sma50 !== null && sma200 !== null && sma50 > sma200;
  const backtest = runPullbackBacktest(validCandles, shortPeriod, longPeriod);
  const prevMacdHist = n >= 2 ? macdSeries.histogram[n - 2] : null;
  const statisticalBounce = calculateStatisticalBounceAnalysis(
    validCandles,
    closes,
    sma50,
    sma200,
    eval50.diagnostics.slopePositiveOrFlat,
    rsi14,
    isMacdBullishCross,
    macdHistogram,
    prevMacdHist
  );

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
    macdPullbackMatch50,
    macdPullbackMatch200,
    diagnostics50: eval50.diagnostics,
    diagnostics200: eval200.diagnostics,
    rsi14,
    atr14,
    atrDistance50,
    atrDistance200,
    macdLine,
    macdSignal,
    macdHistogram,
    isMacdBullishCross,
    isMacdBullish,
    isGoldenCross,
    backtest,
    statisticalBounce,
  };
}
