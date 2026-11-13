from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

SMA_SHORT_PERIOD = 50
SMA_LONG_PERIOD = 200
SMA_HISTORY_LOOKBACK = 15
BOUNCE_TOUCH_TOLERANCE = 1.002


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


def calculate_sma_last_candles(
    closes: List[float], period: int, lookback: int = SMA_HISTORY_LOOKBACK
) -> List[Optional[float]]:
    """Calcula la SMA actual y la de las últimas `lookback` velas."""
    return [calculate_sma_at_offset(closes, period, offset) for offset in range(lookback + 1)]


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

    # Pendiente positiva o neutra-alcista: SMA actual >= SMA hace 10 velas
    slope_ok = sma_10_ago is not None and sma_current >= sma_10_ago

    # Contexto previo: precio hace 5-15 velas cotizaba por encima de dicha media
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

    # Distancia porcentual actual
    distance_pct = ((current_close - sma_current) / sma_current) * 100.0
    abs_threshold = abs(proximity_threshold_pct)

    # Modo A — Zona de Proximidad
    proximity_match = (
        slope_ok
        and was_above_5_15
        and -abs_threshold <= distance_pct <= abs_threshold
    )

    # Modo B — Toque y Rebote Estricto
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
    """Evalúa limpiado OHLC, SMA 50/200 y estrategias Modo A y Modo B."""
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
        )

    closes = [c.close for c in valid_candles]
    diag_50, prox_50, bounce_50 = _evaluate_single_sma(
        valid_candles, closes, short_period, proximity_threshold_pct
    )
    diag_200, prox_200, bounce_200 = _evaluate_single_sma(
        valid_candles, closes, long_period, proximity_threshold_pct
    )

    return SmaEvaluation(
        valid_candles_count=len(valid_candles),
        sma_50=diag_50.sma_current,
        sma_200=diag_200.sma_current,
        distance_sma_50_pct=diag_50.distance_pct,
        distance_sma_200_pct=diag_200.distance_pct,
        proximity_match_50=prox_50,
        proximity_match_200=prox_200,
        bounce_match_50=bounce_50,
        bounce_match_200=bounce_200,
        diagnostics_50=diag_50,
        diagnostics_200=diag_200,
    )
