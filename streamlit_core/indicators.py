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


def calculate_rsi_14(closes: List[float], period: int = RSI_DEFAULT_PERIOD) -> Optional[float]:
    """Calcula el RSI (14) suavizado de Wilder."""
    n = len(closes)
    if period <= 0 or n <= period:
        return None

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

    for i in range(period + 1, n):
        diff = closes[i] - closes[i - 1]
        gain = diff if diff > 0 else 0.0
        loss = abs(diff) if diff < 0 else 0.0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


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

    sma_50 = diag_50.sma_current
    sma_200 = diag_200.sma_current
    atr_dist_50 = (current_close - sma_50) / atr_14 if (atr_14 and atr_14 > 0 and sma_50 is not None) else None
    atr_dist_200 = (current_close - sma_200) / atr_14 if (atr_14 and atr_14 > 0 and sma_200 is not None) else None
    is_golden_cross = sma_50 is not None and sma_200 is not None and sma_50 > sma_200
    backtest = run_pullback_backtest(valid_candles, short_period, long_period)

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
    )
