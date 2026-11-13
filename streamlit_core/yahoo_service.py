from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Dict, List, Optional, Tuple

try:
    import requests as _requests  # type: ignore
except ImportError:
    _requests = None

try:
    import yfinance as _yf  # type: ignore
except ImportError:
    _yf = None

YAHOO_CHART_HOSTS = (
    "https://query1.finance.yahoo.com/v8/finance/chart",
    "https://query2.finance.yahoo.com/v8/finance/chart",
)
DEFAULT_TIMEOUT_SEC = 8.0
DEFAULT_BATCH_SIZE = 6
DEFAULT_BATCH_DELAY_SEC = 0.3

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}


def map_timeframe_to_yahoo_params(timeframe: str) -> Tuple[str, str]:
    """Mapea la temporalidad de la interfaz al intervalo y rango de Yahoo Finance v8."""
    mapping = {
        "1d": ("1d", "2y"),
        "1w": ("1wk", "5y"),
        "1h": ("60m", "60d"),
        "4h": ("60m", "180d"),
    }
    if timeframe not in mapping:
        raise ValueError(f"Temporalidad no soportada: {timeframe}")
    return mapping[timeframe]


def aggregate_hourly_to_4h(hourly_candles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Agrupa cada bloque de 4 velas horarias consecutivas en velas de 4h exactas."""
    if len(hourly_candles) < 4:
        return []

    start_offset = len(hourly_candles) % 4
    aggregated: List[Dict[str, Any]] = []

    for i in range(start_offset, len(hourly_candles) - 3, 4):
        c1, c2, c3, c4 = (
            hourly_candles[i],
            hourly_candles[i + 1],
            hourly_candles[i + 2],
            hourly_candles[i + 3],
        )
        aggregated.append(
            {
                "timestamp": c1["timestamp"],
                "open": c1["open"],
                "high": max(c1["high"], c2["high"], c3["high"], c4["high"]),
                "low": min(c1["low"], c2["low"], c3["low"], c4["low"]),
                "close": c4["close"],
                "volume": c1["volume"] + c2["volume"] + c3["volume"] + c4["volume"],
            }
        )
    return aggregated


def _fetch_via_yfinance(ticker: str, timeframe: str) -> Optional[Dict[str, Any]]:
    """Usa yfinance (con gestión automática de cookies/crumb) cuando está disponible."""
    if _yf is None:
        return None

    interval, period = map_timeframe_to_yahoo_params(timeframe)
    hist = _yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=False)
    if hist is None or hist.empty:
        return None

    raw_candles: List[Dict[str, Any]] = []
    for idx, row in hist.iterrows():
        o = float(row.get("Open", float("nan")))
        h = float(row.get("High", float("nan")))
        l = float(row.get("Low", float("nan")))
        c = float(row.get("Close", float("nan")))
        v = float(row.get("Volume", 0.0))
        if math.isfinite(o) and math.isfinite(h) and math.isfinite(l) and math.isfinite(c) and c > 0:
            ts_ms = int(idx.timestamp() * 1000) if hasattr(idx, "timestamp") else 0
            raw_candles.append(
                {
                    "timestamp": ts_ms,
                    "open": o,
                    "high": h,
                    "low": l,
                    "close": c,
                    "volume": v if math.isfinite(v) and v >= 0 else 0.0,
                }
            )

    if not raw_candles:
        return None

    final_candles = aggregate_hourly_to_4h(raw_candles) if timeframe == "4h" else raw_candles
    if not final_candles:
        return None

    last_c = final_candles[-1]
    prev_c = final_candles[-2] if len(final_candles) >= 2 else last_c
    return {
        "ticker": ticker,
        "timeframe": timeframe,
        "candles": final_candles,
        "regular_market_price": last_c["close"],
        "previous_close": prev_c["close"],
        "fetched_at": int(time.time() * 1000),
    }


def _fetch_json_with_retry(
    ticker: str,
    interval: str,
    range_str: str,
    timeout_sec: float = DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    encoded_ticker = urllib.parse.quote(ticker, safe="")
    last_error: Optional[Exception] = None

    for attempt, base_host in enumerate(YAHOO_CHART_HOSTS):
        url = f"{base_host}/{encoded_ticker}?interval={interval}&range={range_str}&includePrePost=false"
        try:
            if _requests is not None:
                resp = _requests.get(url, headers=DEFAULT_HEADERS, timeout=timeout_sec)
                if resp.status_code == 429:
                    time.sleep(0.5 * (attempt + 1))
                    raise RuntimeError("HTTP 429 Too Many Requests")
                resp.raise_for_status()
                return resp.json()

            req = urllib.request.Request(url, headers=DEFAULT_HEADERS, method="GET")
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                if resp.status >= 400:
                    raise urllib.error.HTTPError(url, resp.status, "HTTP Error", resp.headers, None)
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
            if attempt < len(YAHOO_CHART_HOSTS) - 1:
                time.sleep(0.4)

    raise RuntimeError(f"Error descargando {ticker}: {last_error}")


def fetch_yahoo_candles(
    ticker: str,
    timeframe: str,
    timeout_sec: float = DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """Descarga series históricas OHLCV reales desde Yahoo Finance."""
    # 1. Intentar con yfinance cuando esté instalado (entorno Streamlit Cloud / local)
    if _yf is not None:
        yf_result = _fetch_via_yfinance(ticker, timeframe)
        if yf_result is not None:
            return yf_result

    # 2. Respaldo directo contra endpoint v8 rotando query1 / query2
    interval, range_str = map_timeframe_to_yahoo_params(timeframe)
    payload = _fetch_json_with_retry(ticker, interval, range_str, timeout_sec=timeout_sec)

    chart = payload.get("chart") or {}
    if chart.get("error"):
        err = chart["error"]
        raise RuntimeError(err.get("description") or err.get("code") or f"Error Yahoo en {ticker}")

    results = chart.get("result") or []
    if not results:
        raise RuntimeError(f"Respuesta vacía de Yahoo Finance para {ticker}")

    result = results[0]
    timestamps = result.get("timestamp") or []
    quote_list = (result.get("indicators") or {}).get("quote") or []
    if not quote_list or not timestamps:
        raise RuntimeError(f"Sin series OHLC para {ticker}")

    quote = quote_list[0]
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []

    raw_candles: List[Dict[str, Any]] = []
    for idx, ts in enumerate(timestamps):
        o = opens[idx] if idx < len(opens) else None
        h = highs[idx] if idx < len(highs) else None
        l = lows[idx] if idx < len(lows) else None
        c = closes[idx] if idx < len(closes) else None
        v = volumes[idx] if idx < len(volumes) else 0

        if (
            ts is not None
            and o is not None
            and h is not None
            and l is not None
            and c is not None
            and math.isfinite(o)
            and math.isfinite(h)
            and math.isfinite(l)
            and math.isfinite(c)
            and c > 0
        ):
            raw_candles.append(
                {
                    "timestamp": int(ts) * 1000,
                    "open": float(o),
                    "high": float(h),
                    "low": float(l),
                    "close": float(c),
                    "volume": float(v) if (v is not None and math.isfinite(v) and v >= 0) else 0.0,
                }
            )

    if not raw_candles:
        raise RuntimeError(f"Velas OHLC vacías para {ticker}")

    final_candles = aggregate_hourly_to_4h(raw_candles) if timeframe == "4h" else raw_candles
    if not final_candles:
        raise RuntimeError(f"Insuficientes velas horarias para construir 4h en {ticker}")

    last_c = final_candles[-1]
    prev_c = final_candles[-2] if len(final_candles) >= 2 else last_c
    meta = result.get("meta") or {}

    reg_price = meta.get("regularMarketPrice")
    regular_market_price = (
        float(reg_price)
        if isinstance(reg_price, (int, float)) and math.isfinite(reg_price) and reg_price > 0
        else last_c["close"]
    )

    meta_prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    if timeframe == "1d" and prev_c["close"] > 0:
        previous_close = prev_c["close"]
    elif isinstance(meta_prev, (int, float)) and math.isfinite(meta_prev) and meta_prev > 0:
        previous_close = float(meta_prev)
    else:
        previous_close = prev_c["close"]

    return {
        "ticker": ticker,
        "timeframe": timeframe,
        "candles": final_candles,
        "regular_market_price": regular_market_price,
        "previous_close": previous_close,
        "currency": meta.get("currency", "USD"),
        "fetched_at": int(time.time() * 1000),
    }


def fetch_market_batch(
    tickers: List[str],
    timeframe: str,
    on_progress: Optional[Callable[[int, int, int], None]] = None,
    should_stop: Optional[Callable[[], bool]] = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    batch_delay_sec: float = DEFAULT_BATCH_DELAY_SEC,
) -> Dict[str, Any]:
    """Descarga en lotes controlados de 6 peticiones simultáneas con pausa de 300ms."""
    total = len(tickers)
    results: List[Dict[str, Any]] = []
    incidents: List[Dict[str, str]] = []
    processed = 0
    aborted = False

    for i in range(0, total, batch_size):
        if should_stop and should_stop():
            aborted = True
            break

        chunk = tickers[i : i + batch_size]
        with ThreadPoolExecutor(max_workers=batch_size) as executor:
            future_map = {
                executor.submit(fetch_yahoo_candles, ticker, timeframe): ticker
                for ticker in chunk
            }
            for future in as_completed(future_map):
                if should_stop and should_stop():
                    aborted = True
                    break
                ticker = future_map[future]
                try:
                    res = future.result()
                    results.append(res)
                except Exception as exc:
                    incidents.append(
                        {
                            "ticker": ticker,
                            "message": str(exc),
                        }
                    )
                processed += 1
                if on_progress:
                    on_progress(processed, total, len(incidents))

        if aborted:
            break

        if i + batch_size < total:
            time.sleep(batch_delay_sec)

    return {
        "results": results,
        "incidents": incidents,
        "aborted": aborted,
    }
