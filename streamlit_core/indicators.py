from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

SMA_SHORT_PERIOD = 50
SMA_LONG_PERIOD = 200
SMA_HISTORY_LOOKBACK = 15
BOUNCE_TOUCH_TOLERANCE = 1.002
RSI_DEFAULT_PERIOD = 14
ATR_DEFAULT_PERIOD = 14
MACD_FAST_PERIOD = 12
MACD_SLOW_PERIOD = 26
MACD_SIGNAL_PERIOD = 9


@dataclass
class Candle:
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class SmaDiagnostics:
    sma_current: Optional[float]
    sma_10_ago: Optional[float]
    sma_last_16: List[Optional[float]]
    slope_positive_or_flat: bool
    was_above_in_5_to_15: bool
    touched_recently: bool
    closed_strictly_above: bool
    distance_pct: Optional[float]


@dataclass
class BacktestSmaSummary:
    events_count: int
    win_rate_5_pct: Optional[float]
    avg_return_5_pct: Optional[float]
    win_rate_10_pct: Optional[float]
    avg_return_10_pct: Optional[float]


@dataclass
class PullbackBacktestStats:
    evaluated_bars: int
    sma_50: BacktestSmaSummary
    sma_200: BacktestSmaSummary


@dataclass
class StatisticalHorizonStats:
    horizon_bars: int
    sample_size: int
    wins_count: int
    empirical_win_rate_pct: Optional[float]
    bayesian_prob_pct: float
    wilson_lower_95_pct: float
    avg_return_pct: Optional[float]


@dataclass
class StatisticalBounceAnalysis:
    z_score_20: Optional[float]
    z_score_reversion_prob_pct: float
    support_confirmation_prob_pct: float
    volatility_20_pct: Optional[float]
    horizon_3: StatisticalHorizonStats
    horizon_5: StatisticalHorizonStats
    horizon_10: StatisticalHorizonStats
    composite_prob_3_pct: float
    composite_prob_5_pct: float
    composite_prob_10_pct: float
    confidence_label: str


@dataclass
class SmaEvaluation:
    valid_candles_count: int
    sma_50: Optional[float]
    sma_200: Optional[float]
    distance_sma_50_pct: Optional[float]
    distance_sma_200_pct: Optional[float]
    proximity_match_50: bool
    proximity_match_200: bool
    bounce_match_50: bool
    bounce_match_200: bool
    macd_pullback_match_50: bool
    macd_pullback_match_200: bool
    diagnostics_50: SmaDiagnostics
    diagnostics_200: SmaDiagnostics
    rsi_14: Optional[float]
    atr_14: Optional[float]
    atr_distance_50: Optional[float]
    atr_distance_200: Optional[float]
    macd_line: Optional[float]
    macd_signal: Optional[float]
    macd_histogram: Optional[float]
    is_macd_bullish_cross: bool
    is_macd_bullish: bool
    is_golden_cross: bool
    backtest: PullbackBacktestStats
    statistical_bounce: StatisticalBounceAnalysis


def _is_valid_pos(val: Any) -> bool:
    return isinstance(val, (int, float)) and not isinstance(val, bool) and math.isfinite(val) and val > 0


def sanitize_candles(candles: List[Dict[str, Any]]) -> List[Candle]:
    """Filtra velas incompletas o con valores nulos/no finitos en close, high, low u open."""
    clean: List[Candle] = []
    for c in candles:
        if not isinstance(c, dict):
            continue
        ts = c.get("timestamp")
        o = c.get("open")
        h = c.get("high")
        l = c.get("low")
        cl = c.get("close")
        vol = c.get("volume", 0.0)
        if (
            isinstance(ts, (int, float))
            and _is_valid_pos(o)
            and _is_valid_pos(h)
            and _is_valid_pos(l)
            and _is_valid_pos(cl)
            and float(h) >= float(l)
        ):
            clean_vol = float(vol) if isinstance(vol, (int, float)) and math.isfinite(vol) and vol >= 0 else 0.0
            clean.append(
                Candle(
                    timestamp=int(ts),
                    open=float(o),
                    high=float(h),
                    low=float(l),
                    close=float(cl),
                    volume=clean_vol,
                )
            )
    return clean


def calculate_sma_at_offset(closes: List[float], period: int, offset_from_end: int = 0) -> Optional[float]:
    """Calcula la SMA para un desplazamiento hacia atrás (0 = vela actual)."""
    end_idx = len(closes) - offset_from_end
    if period <= 0 or end_idx < period or offset_from_end < 0:
        return None
    window = closes[end_idx - period : end_idx]
    return sum(window) / period


def calculate_sma_series(closes: List[float], period: int) -> List[Optional[float]]:
    """Calcula la serie O(n) de SMA usando suma móvil."""
    n = len(closes)
    result: List[Optional[float]] = [None] * n
    if period <= 0 or n < period:
        return result

    rolling_sum = 0.0
    for i, val in enumerate(closes):
        rolling_sum += val
        if i >= period:
            rolling_sum -= closes[i - period]
        if i >= period - 1:
            result[i] = rolling_sum / period
    return result


def calculate_ema_series(values: List[float], period: int) -> List[Optional[float]]:
    """Calcula la Media Móvil Exponencial (EMA) inicializada con SMA sobre los primeros `period` valores."""
    n = len(values)
    result: List[Optional[float]] = [None] * n
    if period <= 0 or n < period:
        return result

    ema = sum(values[:period]) / period
    result[period - 1] = ema
    multiplier = 2.0 / (period + 1)

    for i in range(period, n):
        ema = (values[i] - ema) * multiplier + ema
        result[i] = ema
    return result


def calculate_macd_series(
    closes: List[float],
    fast_period: int = MACD_FAST_PERIOD,
    slow_period: int = MACD_SLOW_PERIOD,
    signal_period: int = MACD_SIGNAL_PERIOD,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """Calcula las series de MACD (12, 26, 9): Línea MACD, Línea Señal e Histograma."""
    n = len(closes)
    macd_line: List[Optional[float]] = [None] * n
    signal_line: List[Optional[float]] = [None] * n
    histogram: List[Optional[float]] = [None] * n

    if n < slow_period + signal_period:
        return macd_line, signal_line, histogram

    ema_fast = calculate_ema_series(closes, fast_period)
    ema_slow = calculate_ema_series(closes, slow_period)

    valid_macd: List[float] = []
    valid_indexes: List[int] = []
    for i in range(n):
        f = ema_fast[i]
        s = ema_slow[i]
        if f is not None and s is not None:
            diff = f - s
            macd_line[i] = diff
            valid_macd.append(diff)
            valid_indexes.append(i)

    signal_valid = calculate_ema_series(valid_macd, signal_period)
    for j, orig_idx in enumerate(valid_indexes):
        sig = signal_valid[j]
        macd_val = macd_line[orig_idx]
        if sig is not None and macd_val is not None:
            signal_line[orig_idx] = sig
            histogram[orig_idx] = macd_val - sig

    return macd_line, signal_line, histogram


def calculate_sma_last_candles(
    closes: List[float], period: int, lookback: int = SMA_HISTORY_LOOKBACK
) -> List[Optional[float]]:
    """Calcula la SMA actual y la de las últimas `lookback` velas."""
    return [calculate_sma_at_offset(closes, period, offset) for offset in range(lookback + 1)]


def calculate_rsi_series(closes: List[float], period: int = RSI_DEFAULT_PERIOD) -> List[Optional[float]]:
    """Calcula la serie completa de RSI (14) suavizado de Wilder."""
    n = len(closes)
    result: List[Optional[float]] = [None] * n
    if period <= 0 or n <= period:
        return result

    gain_sum = 0.0
    loss_sum = 0.0
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        if diff >= 0:
            gain_sum += diff
        else:
            loss_sum += abs(diff)

    avg_gain = gain_sum / period
    avg_loss = loss_sum / period
    result[period] = 100.0 if avg_loss == 0 else 100.0 - (100.0 / (1.0 + avg_gain / avg_loss))

    for i in range(period + 1, n):
        diff = closes[i] - closes[i - 1]
        gain = diff if diff > 0 else 0.0
        loss = abs(diff) if diff < 0 else 0.0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        result[i] = 100.0 if avg_loss == 0 else 100.0 - (100.0 / (1.0 + avg_gain / avg_loss))

    return result


def calculate_rsi_14(closes: List[float], period: int = RSI_DEFAULT_PERIOD) -> Optional[float]:
    """Calcula el último RSI (14) suavizado de Wilder."""
    series = calculate_rsi_series(closes, period)
    return series[-1] if series else None


def calculate_atr_14(valid_candles: List[Candle], period: int = ATR_DEFAULT_PERIOD) -> Optional[float]:
    """Calcula el ATR (14) suavizado de Wilder sobre velas válidas."""
    n = len(valid_candles)
    if period <= 0 or n <= period:
        return None

    true_ranges: List[float] = [0.0] * n
    true_ranges[0] = valid_candles[0].high - valid_candles[0].low
    for i in range(1, n):
        cur = valid_candles[i]
        prev_close = valid_candles[i - 1].close
        true_ranges[i] = max(
            cur.high - cur.low,
            abs(cur.high - prev_close),
            abs(cur.low - prev_close),
        )

    atr = sum(true_ranges[1 : period + 1]) / period
    for i in range(period + 1, n):
        atr = (atr * (period - 1) + true_ranges[i]) / period

    return atr if math.isfinite(atr) and atr > 0 else None


def _empty_backtest_summary() -> BacktestSmaSummary:
    return BacktestSmaSummary(
        events_count=0,
        win_rate_5_pct=None,
        avg_return_5_pct=None,
        win_rate_10_pct=None,
        avg_return_10_pct=None,
    )


def _backtest_single_sma(
    valid_candles: List[Candle], closes: List[float], period: int
) -> BacktestSmaSummary:
    n = len(valid_candles)
    min_index = period + SMA_HISTORY_LOOKBACK
    max_index = n - 11
    if max_index < min_index:
        return _empty_backtest_summary()

    sma_series = calculate_sma_series(closes, period)
    returns_5: List[float] = []
    returns_10: List[float] = []
    last_signal_index = -100

    for i in range(min_index, max_index + 1):
        if i - last_signal_index < 5:
            continue

        sma_cur = sma_series[i]
        sma_prev = sma_series[i - 1]
        if sma_cur is None or sma_cur <= 0 or sma_prev is None or sma_prev <= 0:
            continue

        checked = 0
        above_count = 0
        for offset in range(5, 16):
            idx = i - offset
            sma_at_offset = sma_series[idx]
            if idx >= 0 and sma_at_offset is not None and sma_at_offset > 0:
                checked += 1
                if valid_candles[idx].close > sma_at_offset:
                    above_count += 1

        if checked == 0 or above_count < math.ceil(checked * 0.6):
            continue

        cur = valid_candles[i]
        prev = valid_candles[i - 1]
        touched = (
            cur.low <= sma_cur * BOUNCE_TOUCH_TOLERANCE
            or prev.low <= sma_prev * BOUNCE_TOUCH_TOLERANCE
        )
        if not touched or cur.close <= sma_cur:
            continue

        ret_5 = ((valid_candles[i + 5].close - cur.close) / cur.close) * 100.0
        ret_10 = ((valid_candles[i + 10].close - cur.close) / cur.close) * 100.0
        returns_5.append(ret_5)
        returns_10.append(ret_10)
        last_signal_index = i

    if not returns_5:
        return _empty_backtest_summary()

    wins_5 = sum(1 for r in returns_5 if r > 0)
    wins_10 = sum(1 for r in returns_10 if r > 0)
    count = len(returns_5)
    return BacktestSmaSummary(
        events_count=count,
        win_rate_5_pct=(wins_5 / count) * 100.0,
        avg_return_5_pct=sum(returns_5) / count,
        win_rate_10_pct=(wins_10 / count) * 100.0,
        avg_return_10_pct=sum(returns_10) / count,
    )


def run_pullback_backtest(
    valid_candles: List[Candle],
    short_period: int = SMA_SHORT_PERIOD,
    long_period: int = SMA_LONG_PERIOD,
) -> PullbackBacktestStats:
    if len(valid_candles) < short_period + SMA_HISTORY_LOOKBACK + 11:
        return PullbackBacktestStats(
            evaluated_bars=len(valid_candles),
            sma_50=_empty_backtest_summary(),
            sma_200=_empty_backtest_summary(),
        )
    closes = [c.close for c in valid_candles]
    return PullbackBacktestStats(
        evaluated_bars=len(valid_candles),
        sma_50=_backtest_single_sma(valid_candles, closes, short_period),
        sma_200=_backtest_single_sma(valid_candles, closes, long_period),
    )


def _clamp(val: float, min_v: float, max_v: float) -> float:
    return min(max_v, max(min_v, val))


def normal_cdf(x: float) -> float:
    """Función de distribución acumulada normal estándar Φ(x)."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def wilson_lower_bound_pct(wins: int, sample_size: int, z: float = 1.96) -> float:
    """Cota inferior del intervalo de confianza de Wilson al 95% en porcentaje."""
    if sample_size <= 0:
        return 0.0
    p = _clamp(wins / sample_size, 0.0, 1.0)
    z2 = z * z
    denom = 1.0 + z2 / sample_size
    center = p + z2 / (2.0 * sample_size)
    margin = z * math.sqrt((p * (1.0 - p) + z2 / (4.0 * sample_size)) / sample_size)
    return _clamp(((center - margin) / denom) * 100.0, 0.0, 100.0)


def _empty_horizon_stats(horizon_bars: int) -> StatisticalHorizonStats:
    return StatisticalHorizonStats(
        horizon_bars=horizon_bars,
        sample_size=0,
        wins_count=0,
        empirical_win_rate_pct=None,
        bayesian_prob_pct=50.0,
        wilson_lower_95_pct=0.0,
        avg_return_pct=None,
    )


def empty_statistical_bounce() -> StatisticalBounceAnalysis:
    return StatisticalBounceAnalysis(
        z_score_20=None,
        z_score_reversion_prob_pct=50.0,
        support_confirmation_prob_pct=50.0,
        volatility_20_pct=None,
        horizon_3=_empty_horizon_stats(3),
        horizon_5=_empty_horizon_stats(5),
        horizon_10=_empty_horizon_stats(10),
        composite_prob_3_pct=50.0,
        composite_prob_5_pct=50.0,
        composite_prob_10_pct=50.0,
        confidence_label="BAJA",
    )


def _evaluate_horizon_conditional(
    closes: List[float],
    sma50_series: List[Optional[float]],
    sma20_series: List[Optional[float]],
    rsi_series: List[Optional[float]],
    horizon_bars: int,
) -> StatisticalHorizonStats:
    n = len(closes)
    start_idx = 50 if n >= 65 else 20
    end_idx = n - 1 - horizon_bars
    if end_idx < start_idx:
        return _empty_horizon_stats(horizon_bars)

    sample_size = 0
    wins_count = 0
    return_sum = 0.0

    for i in range(start_idx, end_idx + 1):
        c = closes[i]
        s50 = sma50_series[i]
        s20 = sma20_series[i]
        r14 = rsi_series[i]

        near_sma50 = s50 is not None and s50 > 0 and abs((c - s50) / s50) <= 0.03
        below_sma20 = s20 is not None and s20 > 0 and c < s20
        rsi_pullback = r14 is not None and r14 <= 50.0

        if near_sma50 or below_sma20 or rsi_pullback:
            fwd_ret_pct = ((closes[i + horizon_bars] - c) / c) * 100.0
            sample_size += 1
            if fwd_ret_pct > 0:
                wins_count += 1
            return_sum += fwd_ret_pct

    empirical_win_rate = (wins_count / sample_size) * 100.0 if sample_size > 0 else None
    bayesian_prob = ((wins_count + 2.0) / (sample_size + 4.0)) * 100.0
    wilson_95 = wilson_lower_bound_pct(wins_count, sample_size, 1.96)
    avg_ret = return_sum / sample_size if sample_size > 0 else None

    return StatisticalHorizonStats(
        horizon_bars=horizon_bars,
        sample_size=sample_size,
        wins_count=wins_count,
        empirical_win_rate_pct=empirical_win_rate,
        bayesian_prob_pct=bayesian_prob,
        wilson_lower_95_pct=wilson_95,
        avg_return_pct=avg_ret,
    )


def calculate_statistical_bounce_analysis(
    valid_candles: List[Candle],
    closes: List[float],
    sma_50: Optional[float],
    sma_200: Optional[float],
    slope_50_positive: bool,
    rsi_14: Optional[float],
    is_macd_bullish_cross: bool,
    cur_macd_hist: Optional[float],
    prev_macd_hist: Optional[float],
) -> StatisticalBounceAnalysis:
    n = len(closes)
    if n < 21:
        return empty_statistical_bounce()

    win20 = closes[-20:]
    mean20 = sum(win20) / 20.0
    variance20 = sum((v - mean20) * (v - mean20) for v in win20) / 19.0
    std20 = math.sqrt(variance20)
    current_close = closes[-1]
    z_score_20 = (current_close - mean20) / std20 if std20 > 1e-12 else 0.0
    z_reversion_prob = _clamp(normal_cdf(-z_score_20) * 100.0, 5.0, 95.0)

    log_returns = [
        math.log(closes[i] / closes[i - 1])
        for i in range(n - 20, n)
        if closes[i - 1] > 0 and closes[i] > 0
    ]
    volatility_20_pct: Optional[float] = None
    if len(log_returns) >= 2:
        lr_mean = sum(log_returns) / len(log_returns)
        lr_var = sum((v - lr_mean) * (v - lr_mean) for v in log_returns) / (len(log_returns) - 1)
        volatility_20_pct = math.sqrt(lr_var) * 100.0

    recent_vols = [c.volume for c in valid_candles[-21:-1] if c.volume > 0]
    avg_vol = sum(recent_vols) / len(recent_vols) if recent_vols else 0.0
    last_vol = valid_candles[-1].volume
    vol_ratio = (last_vol / avg_vol) if (avg_vol > 0 and last_vol > 0) else 1.0

    logit = 0.0
    if sma_50 is not None and sma_50 > 0:
        d50 = ((current_close - sma_50) / sma_50) * 100.0
        logit += 0.35 if slope_50_positive else -0.25
        if -2.5 <= d50 <= 2.5:
            logit += 0.45
        elif d50 < -5.0:
            logit += 0.15
        elif d50 > 5.0:
            logit -= 0.30
    if sma_200 is not None and sma_200 > 0:
        d200 = ((current_close - sma_200) / sma_200) * 100.0
        if current_close > sma_200:
            logit += 0.25
        if abs(d200) <= 2.5:
            logit += 0.35
    if rsi_14 is not None:
        if rsi_14 <= 35.0:
            logit += 0.55
        elif rsi_14 <= 50.0:
            logit += 0.30
        elif rsi_14 >= 70.0:
            logit -= 0.55
    if is_macd_bullish_cross:
        logit += 0.65
    elif cur_macd_hist is not None and prev_macd_hist is not None and cur_macd_hist > prev_macd_hist:
        logit += 0.30
    elif (
        cur_macd_hist is not None
        and cur_macd_hist < 0
        and prev_macd_hist is not None
        and cur_macd_hist < prev_macd_hist
    ):
        logit -= 0.20
    if vol_ratio >= 1.2:
        logit += 0.20

    support_prob = _clamp((1.0 / (1.0 + math.exp(-logit))) * 100.0, 12.0, 92.0)

    sma50_series = calculate_sma_series(closes, SMA_SHORT_PERIOD)
    sma20_series = calculate_sma_series(closes, 20)
    rsi_series = calculate_rsi_series(closes, RSI_DEFAULT_PERIOD)

    h3 = _evaluate_horizon_conditional(closes, sma50_series, sma20_series, rsi_series, 3)
    h5 = _evaluate_horizon_conditional(closes, sma50_series, sma20_series, rsi_series, 5)
    h10 = _evaluate_horizon_conditional(closes, sma50_series, sma20_series, rsi_series, 10)

    def _combine(bayes_pct: float) -> float:
        return _clamp(0.45 * bayes_pct + 0.25 * z_reversion_prob + 0.30 * support_prob, 5.0, 95.0)

    comp3 = _combine(h3.bayesian_prob_pct)
    comp5 = _combine(h5.bayesian_prob_pct)
    comp10 = _combine(h10.bayesian_prob_pct)

    confidence = "BAJA"
    if h5.sample_size >= 20 and comp5 >= 65.0:
        confidence = "ALTA"
    elif h5.sample_size >= 10 and comp5 >= 55.0:
        confidence = "MEDIA"
    elif h5.sample_size >= 5:
        confidence = "MODERADA"

    return StatisticalBounceAnalysis(
        z_score_20=z_score_20,
        z_score_reversion_prob_pct=z_reversion_prob,
        support_confirmation_prob_pct=support_prob,
        volatility_20_pct=volatility_20_pct,
        horizon_3=h3,
        horizon_5=h5,
        horizon_10=h10,
        composite_prob_3_pct=comp3,
        composite_prob_5_pct=comp5,
        composite_prob_10_pct=comp10,
        confidence_label=confidence,
    )


def get_statistical_horizon_stats(
    stats: StatisticalBounceAnalysis, horizon: int
) -> StatisticalHorizonStats:
    if horizon == 3:
        return stats.horizon_3
    if horizon == 10:
        return stats.horizon_10
    return stats.horizon_5


def get_statistical_probability_pct(
    stats: StatisticalBounceAnalysis, model: str, horizon: int
) -> float:
    h_stats = get_statistical_horizon_stats(stats, horizon)
    if model == "EMPIRICAL":
        return h_stats.bayesian_prob_pct
    if model == "ZSCORE":
        return stats.z_score_reversion_prob_pct
    if model == "WILSON_95":
        return h_stats.wilson_lower_95_pct
    if horizon == 3:
        return stats.composite_prob_3_pct
    if horizon == 10:
        return stats.composite_prob_10_pct
    return stats.composite_prob_5_pct


def _empty_diagnostics() -> SmaDiagnostics:
    return SmaDiagnostics(
        sma_current=None,
        sma_10_ago=None,
        sma_last_16=[],
        slope_positive_or_flat=False,
        was_above_in_5_to_15=False,
        touched_recently=False,
        closed_strictly_above=False,
        distance_pct=None,
    )


def _evaluate_single_sma(
    valid_candles: List[Candle],
    closes: List[float],
    period: int,
    proximity_threshold_pct: float,
) -> tuple[SmaDiagnostics, bool, bool]:
    if len(valid_candles) < period:
        return _empty_diagnostics(), False, False

    sma_last_16 = calculate_sma_last_candles(closes, period, SMA_HISTORY_LOOKBACK)
    sma_current = sma_last_16[0]
    sma_10_ago = sma_last_16[10] if len(sma_last_16) > 10 else None

    if sma_current is None or sma_current <= 0:
        return _empty_diagnostics(), False, False

    n = len(valid_candles)
    current_candle = valid_candles[n - 1]
    prev_candle = valid_candles[n - 2] if n >= 2 else None
    current_close = current_candle.close

    slope_ok = sma_10_ago is not None and sma_current >= sma_10_ago

    checked_offsets = 0
    above_count = 0
    for offset in range(5, 16):
        candle_idx = n - 1 - offset
        sma_at_offset = sma_last_16[offset] if offset < len(sma_last_16) else None
        if candle_idx >= 0 and sma_at_offset is not None and sma_at_offset > 0:
            checked_offsets += 1
            if valid_candles[candle_idx].close > sma_at_offset:
                above_count += 1

    was_above_5_15 = checked_offsets > 0 and above_count >= math.ceil(checked_offsets * 0.6)

    distance_pct = ((current_close - sma_current) / sma_current) * 100.0
    abs_threshold = abs(proximity_threshold_pct)

    proximity_match = (
        slope_ok
        and was_above_5_15
        and -abs_threshold <= distance_pct <= abs_threshold
    )

    sma_prev = sma_last_16[1] if len(sma_last_16) > 1 and sma_last_16[1] is not None else sma_current
    touched_current = current_candle.low <= sma_current * BOUNCE_TOUCH_TOLERANCE
    touched_prev = prev_candle is not None and prev_candle.low <= sma_prev * BOUNCE_TOUCH_TOLERANCE
    touched_recently = touched_current or touched_prev
    closed_strictly_above = current_close > sma_current

    bounce_match = was_above_5_15 and touched_recently and closed_strictly_above

    diag = SmaDiagnostics(
        sma_current=sma_current,
        sma_10_ago=sma_10_ago,
        sma_last_16=sma_last_16,
        slope_positive_or_flat=slope_ok,
        was_above_in_5_to_15=was_above_5_15,
        touched_recently=touched_recently,
        closed_strictly_above=closed_strictly_above,
        distance_pct=distance_pct,
    )
    return diag, proximity_match, bounce_match


def evaluate_pullback_signals(
    raw_candles: List[Dict[str, Any]],
    proximity_threshold_pct: float = 1.5,
    short_period: int = SMA_SHORT_PERIOD,
    long_period: int = SMA_LONG_PERIOD,
) -> SmaEvaluation:
    """Evalúa limpiado OHLC, SMA 50/200, RSI(14), ATR(14), MACD(12,26,9), Golden Cross y Backtest rápido."""
    valid_candles = sanitize_candles(raw_candles)
    if not valid_candles:
        empty = _empty_diagnostics()
        return SmaEvaluation(
            valid_candles_count=0,
            sma_50=None,
            sma_200=None,
            distance_sma_50_pct=None,
            distance_sma_200_pct=None,
            proximity_match_50=False,
            proximity_match_200=False,
            bounce_match_50=False,
            bounce_match_200=False,
            macd_pullback_match_50=False,
            macd_pullback_match_200=False,
            diagnostics_50=empty,
            diagnostics_200=empty,
            rsi_14=None,
            atr_14=None,
            atr_distance_50=None,
            atr_distance_200=None,
            macd_line=None,
            macd_signal=None,
            macd_histogram=None,
            is_macd_bullish_cross=False,
            is_macd_bullish=False,
            is_golden_cross=False,
            backtest=PullbackBacktestStats(
                evaluated_bars=0,
                sma_50=_empty_backtest_summary(),
                sma_200=_empty_backtest_summary(),
            ),
            statistical_bounce=empty_statistical_bounce(),
        )

    closes = [c.close for c in valid_candles]
    current_close = closes[-1]
    diag_50, prox_50, bounce_50 = _evaluate_single_sma(
        valid_candles, closes, short_period, proximity_threshold_pct
    )
    diag_200, prox_200, bounce_200 = _evaluate_single_sma(
        valid_candles, closes, long_period, proximity_threshold_pct
    )

    rsi_14 = calculate_rsi_14(closes, RSI_DEFAULT_PERIOD)
    atr_14 = calculate_atr_14(valid_candles, ATR_DEFAULT_PERIOD)

    macd_series, sig_series, hist_series = calculate_macd_series(
        closes, MACD_FAST_PERIOD, MACD_SLOW_PERIOD, MACD_SIGNAL_PERIOD
    )
    n = len(closes)
    macd_line = macd_series[-1] if n >= 1 else None
    macd_signal = sig_series[-1] if n >= 1 else None
    macd_histogram = hist_series[-1] if n >= 1 else None
    prev_macd = macd_series[-2] if n >= 2 else None
    prev_signal = sig_series[-2] if n >= 2 else None

    is_macd_bullish_cross = (
        macd_line is not None
        and macd_signal is not None
        and prev_macd is not None
        and prev_signal is not None
        and prev_macd <= prev_signal
        and macd_line > macd_signal
    )
    is_macd_bullish = (
        macd_line is not None and macd_signal is not None and macd_line > macd_signal
    )

    macd_pullback_match_50 = (prox_50 or bounce_50) and is_macd_bullish_cross
    macd_pullback_match_200 = (prox_200 or bounce_200) and is_macd_bullish_cross

    sma_50 = diag_50.sma_current
    sma_200 = diag_200.sma_current
    atr_dist_50 = (current_close - sma_50) / atr_14 if (atr_14 and atr_14 > 0 and sma_50 is not None) else None
    atr_dist_200 = (current_close - sma_200) / atr_14 if (atr_14 and atr_14 > 0 and sma_200 is not None) else None
    is_golden_cross = sma_50 is not None and sma_200 is not None and sma_50 > sma_200
    backtest = run_pullback_backtest(valid_candles, short_period, long_period)
    prev_macd_hist = hist_series[-2] if n >= 2 else None
    statistical_bounce = calculate_statistical_bounce_analysis(
        valid_candles,
        closes,
        sma_50,
        sma_200,
        diag_50.slope_positive_or_flat,
        rsi_14,
        is_macd_bullish_cross,
        macd_histogram,
        prev_macd_hist,
    )

    return SmaEvaluation(
        valid_candles_count=len(valid_candles),
        sma_50=sma_50,
        sma_200=sma_200,
        distance_sma_50_pct=diag_50.distance_pct,
        distance_sma_200_pct=diag_200.distance_pct,
        proximity_match_50=prox_50,
        proximity_match_200=prox_200,
        bounce_match_50=bounce_50,
        bounce_match_200=bounce_200,
        macd_pullback_match_50=macd_pullback_match_50,
        macd_pullback_match_200=macd_pullback_match_200,
        diagnostics_50=diag_50,
        diagnostics_200=diag_200,
        rsi_14=rsi_14,
        atr_14=atr_14,
        atr_distance_50=atr_dist_50,
        atr_distance_200=atr_dist_200,
        macd_line=macd_line,
        macd_signal=macd_signal,
        macd_histogram=macd_histogram,
        is_macd_bullish_cross=is_macd_bullish_cross,
        is_macd_bullish=is_macd_bullish,
        is_golden_cross=is_golden_cross,
        backtest=backtest,
        statistical_bounce=statistical_bounce,
    )
