from __future__ import annotations

import importlib
import inspect
import json
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pandas as pd
import streamlit as st

try:
    import plotly.graph_objects as go  # type: ignore
    from plotly.subplots import make_subplots  # type: ignore
except ImportError:
    go = None
    make_subplots = None

import streamlit_core.indicators as _indicators_mod

if "macd_pullback_match_50" not in getattr(
    getattr(_indicators_mod, "SmaEvaluation", None), "__dataclass_fields__", {}
):
    _indicators_mod = importlib.reload(_indicators_mod)

SMA_LONG_PERIOD = _indicators_mod.SMA_LONG_PERIOD
SMA_SHORT_PERIOD = _indicators_mod.SMA_SHORT_PERIOD
calculate_macd_series = _indicators_mod.calculate_macd_series
calculate_sma_series = _indicators_mod.calculate_sma_series
evaluate_pullback_signals = _indicators_mod.evaluate_pullback_signals
sanitize_candles = _indicators_mod.sanitize_candles
from streamlit_core.tickers_data import (
    DAX_40_TICKERS,
    EUROPE_TICKERS,
    IBEX_35_TICKERS,
    MARKETS_METADATA,
    SP500_TICKERS,
    get_tickers_by_market,
    infer_currency_symbol,
)
from streamlit_core.yahoo_service import fetch_market_batch

CACHE_TTL_SECONDS = 300  # 5 minutos
DEFAULT_WATCHLIST = ["ITX.MC", "SAN.MC", "IBE.MC", "SAP.DE", "SIE.DE", "AAPL", "MSFT", "NVDA"]

st.set_page_config(
    page_title="Monitor Pullback SMA — IBEX 35, DAX 40 y S&P 500",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Estilos corporativos SaaS Modo Claro y tipografía tabular
st.markdown(
    """
    <style>
      .stApp {
        background-color: #F8FAFC;
        color: #0F172A;
      }
      div[data-testid="stMetric"] {
        background-color: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 10px;
        padding: 14px 16px;
        font-variant-numeric: tabular-nums;
      }
      div[data-testid="stMetricValue"] {
        font-variant-numeric: tabular-nums;
      }
      .block-container {
        padding-top: 1.5rem;
        padding-bottom: 2rem;
        max-width: 1440px;
      }
    </style>
    """,
    unsafe_allow_html=True,
)


def normalize_watchlist_tokens(raw_tokens: List[str]) -> List[str]:
    seen = set()
    clean: List[str] = []
    for raw in raw_tokens:
        t = raw.strip().upper().strip('"')
        if not t:
            continue
        if t.startswith("BME:"):
            t = f"{t[4:]}.MC"
        elif t.startswith("XETR:"):
            t = f"{t[5:]}.DE"
        elif ":" in t:
            t = t.split(":", 1)[1].strip()
        if re.match(r"^[A-Z0-9.-]{1,16}$", t) and t not in seen:
            seen.add(t)
            clean.append(t)
    return clean


def parse_watchlist_text(raw_text: str) -> List[str]:
    trimmed = raw_text.strip()
    if not trimmed:
        return []
    if trimmed.startswith("[") or trimmed.startswith("{"):
        try:
            data = json.loads(trimmed)
            if isinstance(data, list):
                return normalize_watchlist_tokens([str(x) for x in data])
            if isinstance(data, dict) and isinstance(data.get("tickers"), list):
                return normalize_watchlist_tokens([str(x) for x in data["tickers"]])
        except Exception:
            pass
    tokens = re.split(r"[\s,;]+", trimmed)
    return normalize_watchlist_tokens(tokens)


def format_tradingview_symbol(ticker: str) -> str:
    if ticker.endswith(".MC"):
        return f"BME:{ticker[:-3]}"
    if ticker.endswith(".DE"):
        return f"XETR:{ticker[:-3]}"
    return ticker.replace("-", ".")


def build_centered_microbar(distance_pct: Optional[float], threshold_pct: float) -> str:
    """Construye una micro-barra visual simétrica centrada en 0.00%."""
    if distance_pct is None:
        return "—"
    scale_max = max(5.0, abs(threshold_pct) * 2.0)
    slots = 5
    filled = min(slots, max(1, round((abs(distance_pct) / scale_max) * slots)))
    if distance_pct >= 0:
        left = "░" * slots
        right = ("█" * filled) + ("░" * (slots - filled))
    else:
        left = ("░" * (slots - filled)) + ("█" * filled)
        right = "░" * slots
    return f"{left}│{right}"


def init_session_state() -> None:
    if "market_cache" not in st.session_state:
        st.session_state.market_cache = {}
    if "stop_requested" not in st.session_state:
        st.session_state.stop_requested = False
    if "last_scan_status" not in st.session_state:
        st.session_state.last_scan_status = "IDLE"
    if "watchlist_tickers" not in st.session_state:
        st.session_state.watchlist_tickers = list(DEFAULT_WATCHLIST)
    if "watchlist_live_cache" not in st.session_state:
        st.session_state.watchlist_live_cache = {}


def get_valid_cache_entry(market_id: str, timeframe: str) -> Optional[Dict[str, Any]]:
    key = f"{market_id}_{timeframe}"
    entry = st.session_state.market_cache.get(key)
    if not entry:
        return None
    if time.time() > entry["expires_at"]:
        del st.session_state.market_cache[key]
        return None
    return entry


def set_cache_entry(
    market_id: str,
    timeframe: str,
    responses: List[Dict[str, Any]],
    incidents: List[Dict[str, str]],
) -> None:
    key = f"{market_id}_{timeframe}"
    now = time.time()
    st.session_state.market_cache[key] = {
        "key": key,
        "market": market_id,
        "timeframe": timeframe,
        "responses": responses,
        "incidents": incidents,
        "cached_at": now,
        "expires_at": now + CACHE_TTL_SECONDS,
    }


def get_cached_responses_for_watchlist(
    tickers: List[str], preferred_timeframe: str
) -> Dict[str, tuple[Dict[str, Any], str]]:
    """Busca en todo el caché vigente las series más recientes para cada ticker de la Watchlist."""
    if not tickers:
        return {}
    wanted = {t.upper() for t in tickers}
    now = time.time()
    valid_entries: List[Dict[str, Any]] = []
    for key in list(st.session_state.market_cache.keys()):
        entry = st.session_state.market_cache[key]
        if now > entry["expires_at"]:
            del st.session_state.market_cache[key]
        else:
            valid_entries.append(entry)

    valid_entries.sort(
        key=lambda e: (1 if e["timeframe"] == preferred_timeframe else 0, e["cached_at"]),
        reverse=True,
    )

    found: Dict[str, tuple[Dict[str, Any], str]] = {}

    # Priorizar respuestas obtenidas específicamente en tiempo real desde el visor del Watchlist
    live_entries: List[Dict[str, Any]] = []
    live_cache = st.session_state.get("watchlist_live_cache")
    if isinstance(live_cache, dict):
        for k in list(live_cache.keys()):
            entry = live_cache[k]
            if not isinstance(entry, dict) or "expires_at" not in entry or now > entry["expires_at"]:
                del live_cache[k]
            else:
                live_entries.append(entry)

    live_entries.sort(
        key=lambda e: (1 if e["timeframe"] == preferred_timeframe else 0, e["cached_at"]),
        reverse=True,
    )
    for entry in live_entries:
        res = entry["response"]
        upper = res["ticker"].upper()
        if upper in wanted and upper not in found:
            found[upper] = (res, "WATCHLIST")

    for entry in valid_entries:
        for res in entry["responses"]:
            upper = res["ticker"].upper()
            if upper in wanted and upper not in found:
                found[upper] = (res, entry["market"])
    return found


def evaluate_cached_market(
    responses: List[Dict[str, Any]],
    ticker_info_map: Dict[str, Dict[str, str]],
    market_id: str,
    proximity_threshold_pct: float,
) -> tuple[List[Dict[str, Any]], float]:
    t0 = time.perf_counter()
    rows: List[Dict[str, Any]] = []
    fallback_symbol = str(MARKETS_METADATA[market_id]["currencySymbol"])

    for res in responses:
        ticker = res["ticker"]
        info = ticker_info_map.get(ticker) or ticker_info_map.get(ticker.upper())
        if not info:
            continue

        valid_candles = sanitize_candles(res["candles"])
        if not valid_candles:
            continue

        last_c = valid_candles[-1]
        prev_c = valid_candles[-2] if len(valid_candles) >= 2 else last_c
        price = last_c.close
        prev_close = res.get("previous_close") or prev_c.close
        change_pct = ((price - prev_close) / prev_close) * 100.0 if prev_close > 0 else 0.0

        eval_out = evaluate_pullback_signals(
            res["candles"],
            proximity_threshold_pct=proximity_threshold_pct,
            short_period=SMA_SHORT_PERIOD,
            long_period=SMA_LONG_PERIOD,
        )

        recent_vols = [c.volume for c in valid_candles[-21:-1] if c.volume > 0]
        avg_vol = sum(recent_vols) / len(recent_vols) if recent_vols else 0.0
        vol_ratio = (last_c.volume / avg_vol) if (avg_vol > 0 and last_c.volume > 0) else 1.0
        symbol = infer_currency_symbol(ticker, fallback_symbol)

        prox_50 = bool(getattr(eval_out, "proximity_match_50", False))
        prox_200 = bool(getattr(eval_out, "proximity_match_200", False))
        bounce_50 = bool(getattr(eval_out, "bounce_match_50", False))
        bounce_200 = bool(getattr(eval_out, "bounce_match_200", False))
        is_macd_cross = bool(getattr(eval_out, "is_macd_bullish_cross", False))
        macd_pb_50 = bool(
            getattr(
                eval_out,
                "macd_pullback_match_50",
                (prox_50 or bounce_50) and is_macd_cross,
            )
        )
        macd_pb_200 = bool(
            getattr(
                eval_out,
                "macd_pullback_match_200",
                (prox_200 or bounce_200) and is_macd_cross,
            )
        )

        rows.append(
            {
                "ticker": ticker,
                "yahoo_url": f"https://finance.yahoo.com/quote/{ticker}",
                "name": info["name"],
                "sector": info["sector"],
                "currency": symbol,
                "price": price,
                "open": last_c.open,
                "high": last_c.high,
                "low": last_c.low,
                "change_pct": change_pct,
                "sma_50": getattr(eval_out, "sma_50", None),
                "sma_200": getattr(eval_out, "sma_200", None),
                "dist_50": getattr(eval_out, "distance_sma_50_pct", None),
                "dist_200": getattr(eval_out, "distance_sma_200_pct", None),
                "prox_50": prox_50,
                "prox_200": prox_200,
                "bounce_50": bounce_50,
                "bounce_200": bounce_200,
                "macd_pullback_50": macd_pb_50,
                "macd_pullback_200": macd_pb_200,
                "diag_50": eval_out.diagnostics_50,
                "diag_200": eval_out.diagnostics_200,
                "rsi_14": getattr(eval_out, "rsi_14", None),
                "atr_14": getattr(eval_out, "atr_14", None),
                "atr_dist_50": getattr(eval_out, "atr_distance_50", None),
                "atr_dist_200": getattr(eval_out, "atr_distance_200", None),
                "macd_line": getattr(eval_out, "macd_line", None),
                "macd_signal": getattr(eval_out, "macd_signal", None),
                "macd_histogram": getattr(eval_out, "macd_histogram", None),
                "is_macd_bullish_cross": is_macd_cross,
                "is_macd_bullish": bool(getattr(eval_out, "is_macd_bullish", False)),
                "is_golden_cross": bool(getattr(eval_out, "is_golden_cross", False)),
                "backtest": eval_out.backtest,
                "candles": valid_candles,
                "volume_ratio": vol_ratio,
                "valid_candles": getattr(eval_out, "valid_candles_count", len(valid_candles)),
                "raw_candles": len(res["candles"]),
            }
        )

    elapsed_ms = max(0.1, round((time.perf_counter() - t0) * 1000.0, 2))
    return rows, elapsed_ms


def get_min_atr_dist(row: Dict[str, Any], sma_filter_label: str) -> Optional[float]:
    d50 = row["atr_dist_50"]
    d200 = row["atr_dist_200"]
    if sma_filter_label == "SMA 50":
        return d50
    if sma_filter_label == "SMA 200":
        return d200
    if d50 is not None and d200 is not None:
        return d50 if abs(d50) <= abs(d200) else d200
    return d50 if d50 is not None else d200


def get_strategy_mode(label: str) -> str:
    if label.startswith("Modo A"):
        return "PROXIMITY"
    if label.startswith("Modo B"):
        return "BOUNCE"
    return "PULLBACK_MACD"


def get_strategy_matches(row: Dict[str, Any], strategy_mode: str) -> tuple[bool, bool]:
    if strategy_mode == "PROXIMITY":
        return bool(row["prox_50"]), bool(row["prox_200"])
    if strategy_mode == "BOUNCE":
        return bool(row["bounce_50"]), bool(row["bounce_200"])
    return bool(row["macd_pullback_50"]), bool(row["macd_pullback_200"])


def build_excel_es_csv(rows: List[Dict[str, Any]], market_id: str, timeframe: str) -> bytes:
    def fmt_es(val: Optional[float]) -> str:
        if val is None:
            return ""
        return f"{val:.2f}".replace(".", ",")

    headers = [
        "Ticker",
        "Nombre",
        "Sector",
        "Mercado",
        "Temporalidad",
        "Precio",
        "Variacion %",
        "SMA 50",
        "Dist. SMA 50 %",
        "SMA 200",
        "Dist. SMA 200 %",
        "RSI 14",
        "MACD (12,26,9)",
        "MACD Senal",
        "MACD Histograma",
        "Cruce MACD",
        "ATR 14",
        "Golden Cross",
        "Volumen Relativo",
        "Velas Validas",
        "Media Objetivo",
    ]
    lines = [";".join(headers)]
    for r in rows:
        macd_status = (
            "CRUCE AL ALZA"
            if r["is_macd_bullish_cross"]
            else ("ALCISTA" if r["is_macd_bullish"] else "BAJISTA")
        )
        lines.append(
            ";".join(
                [
                    r["ticker"],
                    f'"{r["name"].replace(chr(34), chr(34)*2)}"',
                    f'"{r["sector"]}"',
                    market_id,
                    timeframe,
                    fmt_es(r["price"]),
                    fmt_es(r["change_pct"]),
                    fmt_es(r["sma_50"]),
                    fmt_es(r["dist_50"]),
                    fmt_es(r["sma_200"]),
                    fmt_es(r["dist_200"]),
                    fmt_es(r["rsi_14"]),
                    fmt_es(r["macd_line"]),
                    fmt_es(r["macd_signal"]),
                    fmt_es(r["macd_histogram"]),
                    macd_status,
                    fmt_es(r["atr_14"]),
                    "SI" if r["is_golden_cross"] else "NO",
                    fmt_es(r["volume_ratio"]),
                    str(r["valid_candles"]),
                    r["media_badge"],
                ]
            )
        )
    content = "\ufeff" + "\r\n".join(lines)
    return content.encode("utf-8")


def render_ohlc_chart(
    target: Dict[str, Any],
    threshold_pct: float,
    chart_key: Optional[str] = None,
) -> None:
    candles = target["candles"]
    if len(candles) < 2:
        st.caption("No hay suficientes velas válidas para el gráfico.")
        return

    closes = [c.close for c in candles]
    sma50_all = calculate_sma_series(closes, SMA_SHORT_PERIOD)
    sma200_all = calculate_sma_series(closes, SMA_LONG_PERIOD)
    macd_all, sig_all, hist_all = calculate_macd_series(closes)

    tail = min(100, len(candles))
    sl_candles = candles[-tail:]
    sl_sma50 = sma50_all[-tail:]
    sl_sma200 = sma200_all[-tail:]
    sl_macd = macd_all[-tail:]
    sl_sig = sig_all[-tail:]
    sl_hist = hist_all[-tail:]
    dates = [
        datetime.fromtimestamp(c.timestamp / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
        for c in sl_candles
    ]

    if go is not None and make_subplots is not None:
        fig = make_subplots(
            rows=2,
            cols=1,
            shared_xaxes=True,
            vertical_spacing=0.06,
            row_heights=[0.72, 0.28],
        )
        fig.add_trace(
            go.Candlestick(
                x=dates,
                open=[c.open for c in sl_candles],
                high=[c.high for c in sl_candles],
                low=[c.low for c in sl_candles],
                close=[c.close for c in sl_candles],
                name=target["ticker"],
                increasing_line_color="#10B981",
                decreasing_line_color="#EF4444",
            ),
            row=1,
            col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=dates,
                y=sl_sma50,
                mode="lines",
                name="SMA 50",
                line=dict(color="#1D4ED8", width=1.8),
            ),
            row=1,
            col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=dates,
                y=sl_sma200,
                mode="lines",
                name="SMA 200",
                line=dict(color="#4338CA", width=1.8),
            ),
            row=1,
            col=1,
        )
        fig.add_trace(
            go.Bar(
                x=dates,
                y=sl_hist,
                name="Histograma MACD",
                marker_color=[
                    "rgba(16, 185, 129, 0.5)" if (v is not None and v >= 0) else "rgba(239, 68, 68, 0.5)"
                    for v in sl_hist
                ],
            ),
            row=2,
            col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=dates,
                y=sl_macd,
                mode="lines",
                name="MACD (12,26)",
                line=dict(color="#0F766E", width=1.6),
            ),
            row=2,
            col=1,
        )
        fig.add_trace(
            go.Scatter(
                x=dates,
                y=sl_sig,
                mode="lines",
                name="Señal (9)",
                line=dict(color="#F59E0B", width=1.4),
            ),
            row=2,
            col=1,
        )
        fig.update_layout(
            height=480,
            margin=dict(l=10, r=10, t=24, b=10),
            xaxis_rangeslider_visible=False,
            template="plotly_white",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        )
        if chart_key and "key" in inspect.signature(st.plotly_chart).parameters:
            st.plotly_chart(fig, use_container_width=True, key=chart_key)
        else:
            st.plotly_chart(fig, use_container_width=True)
    else:
        chart_df = pd.DataFrame(
            {
                "Fecha": dates,
                "Cierre": [c.close for c in sl_candles],
                "SMA 50": sl_sma50,
                "SMA 200": sl_sma200,
            }
        ).set_index("Fecha")
        st.line_chart(chart_df)


def main() -> None:
    init_session_state()

    st.title("Monitor Pullback SMA — IBEX 35, DAX 40 y S&P 500")
    st.caption(
        "Sistema profesional en tiempo real para detectar pullbacks a SMA 50 y SMA 200 · "
        "RSI(14), ATR(14), Golden Cross, Backtest rápido y Watchlist"
    )

    tab_scanner, tab_universe, tab_methodology = st.tabs(
        ["Escáner Pullback", "Universo de Índices", "Metodología SMA"]
    )

    with tab_scanner:
        col_m, col_tf, col_strat, col_sma = st.columns([1.5, 1.0, 1.8, 1.1])

        with col_m:
            market_options = ["IBEX35", "DAX", "SP500", "EUROPE", "WATCHLIST"]
            market_labels = {
                "IBEX35": f"IBEX 35 ({len(IBEX_35_TICKERS)})",
                "DAX": f"DAX 40 ({len(DAX_40_TICKERS)})",
                "SP500": f"S&P 500 ({len(SP500_TICKERS)})",
                "EUROPE": f"Europa ({len(EUROPE_TICKERS)})",
                "WATCHLIST": f"★ Watchlist ({len(st.session_state.watchlist_tickers)})",
            }
            market_id = st.selectbox(
                "Mercado / Índice",
                options=market_options,
                format_func=lambda m: market_labels[m],
                key="selected_market",
            )

        with col_tf:
            timeframe = st.selectbox(
                "Temporalidad",
                options=["1d", "1w", "4h", "1h"],
                index=0,
                key="selected_timeframe",
            )

        with col_strat:
            strategy_label = st.radio(
                "Estrategia de Pullback",
                options=[
                    "Modo A: Zona de Proximidad",
                    "Modo B: Toque y Rebote Estricto",
                    "Modo C: Pullback + Cruce MACD",
                ],
                horizontal=True,
                key="selected_strategy",
            )
            strategy_mode = get_strategy_mode(strategy_label)

        with col_sma:
            sma_filter_label = st.selectbox(
                "Filtro de Media",
                options=["Todas", "SMA 50", "SMA 200"],
                key="selected_sma_filter",
            )

        # Ventana WATCHLIST permanente en la pantalla principal (Seguimiento)
        with st.expander(
            f"★ WATCHLIST — Seguimiento de Acciones ({len(st.session_state.watchlist_tickers)} guardadas)",
            expanded=True,
        ):
            wl_col1, wl_col2, wl_col3 = st.columns([2.2, 1.0, 1.0])
            with wl_col1:
                wl_add_input = st.text_input(
                    "Añadir tickers a Watchlist (ej. ITX.MC, SAP.DE, AAPL, BME:SAN)",
                    value="",
                    placeholder="Introduce uno o varios tickers separados por coma...",
                    key="wl_quick_add_input",
                )
            with wl_col2:
                st.write("")
                if st.button("Añadir a Watchlist", use_container_width=True, key="wl_quick_add_btn"):
                    parsed_add = parse_watchlist_text(wl_add_input)
                    if parsed_add:
                        merged = normalize_watchlist_tokens(
                            st.session_state.watchlist_tickers + parsed_add
                        )
                        st.session_state.watchlist_tickers = merged
                        for k in list(st.session_state.market_cache.keys()):
                            if k.startswith("WATCHLIST_"):
                                del st.session_state.market_cache[k]
                        st.rerun()
            with wl_col3:
                st.write("")
                scan_wl_clicked = st.button(
                    f"Escanear Watchlist ({timeframe})",
                    disabled=len(st.session_state.watchlist_tickers) == 0,
                    use_container_width=True,
                    key="wl_scan_direct_btn",
                )

            if scan_wl_clicked and st.session_state.watchlist_tickers:
                wl_universe = get_tickers_by_market("WATCHLIST", st.session_state.watchlist_tickers)
                wl_progress = st.progress(0, text=f"Analizando 0 de {len(wl_universe)} acciones de Watchlist...")
                wl_batch = fetch_market_batch(
                    [t["ticker"] for t in wl_universe],
                    timeframe=timeframe,
                    on_progress=lambda p, tot, _inc: wl_progress.progress(
                        int((p / max(1, tot)) * 100),
                        text=f"Analizando Watchlist: {p} de {tot}...",
                    ),
                )
                set_cache_entry("WATCHLIST", timeframe, wl_batch["results"], wl_batch["incidents"])
                wl_progress.empty()
                st.rerun()

            wl_cached_map = get_cached_responses_for_watchlist(
                st.session_state.watchlist_tickers, timeframe
            )
            wl_threshold_val = float(st.session_state.get("proximity_threshold", 1.5))

            if not st.session_state.watchlist_tickers:
                st.info("Tu Watchlist está vacía. Añade tickers arriba o desde el detalle de cualquier valor.")
                if st.button("Restaurar selección inicial (8 valores)", key="wl_restore_defaults_btn"):
                    st.session_state.watchlist_tickers = list(DEFAULT_WATCHLIST)
                    st.rerun()
            else:
                wl_universe_info = {
                    t["ticker"]: t
                    for t in get_tickers_by_market("WATCHLIST", st.session_state.watchlist_tickers)
                }
                wl_table_rows: List[Dict[str, Any]] = []
                wl_eval_by_ticker: Dict[str, Dict[str, Any]] = {}
                for wl_t in st.session_state.watchlist_tickers:
                    u_info = wl_universe_info.get(
                        wl_t, {"ticker": wl_t, "name": wl_t, "sector": "Personalizado"}
                    )
                    cached_pair = wl_cached_map.get(wl_t.upper())
                    if cached_pair:
                        res_obj, res_mkt = cached_pair
                        eval_rows, _ = evaluate_cached_market(
                            [res_obj],
                            {wl_t: u_info},
                            res_mkt,
                            wl_threshold_val,
                        )
                        if eval_rows:
                            er = eval_rows[0]
                            wl_eval_by_ticker[wl_t.upper()] = er
                            m50, m200 = get_strategy_matches(er, strategy_mode)
                            if strategy_mode == "PULLBACK_MACD":
                                sig_lbl = (
                                    "Confluencia + MACD ↑"
                                    if (m50 and m200)
                                    else ("SMA 50 + MACD ↑" if m50 else ("SMA 200 + MACD ↑" if m200 else "Sin señal"))
                                )
                            else:
                                sig_lbl = (
                                    "Confluencia 50+200"
                                    if (m50 and m200)
                                    else ("SMA 50" if m50 else ("SMA 200" if m200 else "Sin señal"))
                                )
                            macd_lbl = (
                                f"{er['macd_line']:+.2f} ({'Cruce ↑' if er['is_macd_bullish_cross'] else ('Alcista' if er['is_macd_bullish'] else 'Bajista')})"
                                if er["macd_line"] is not None
                                else "—"
                            )
                            wl_table_rows.append(
                                {
                                    "Ticker": wl_t,
                                    "Compañía": u_info["name"],
                                    "Sector": u_info["sector"],
                                    "Precio": f"{er['price']:.2f}",
                                    "Var. %": f"{er['change_pct']:+.2f}%",
                                    "Dist. SMA 50": f"{er['dist_50']:+.2f}%" if er["dist_50"] is not None else "—",
                                    "Dist. SMA 200": f"{er['dist_200']:+.2f}%" if er["dist_200"] is not None else "—",
                                    "MACD": macd_lbl,
                                    "RSI 14": f"{er['rsi_14']:.1f}" if er["rsi_14"] is not None else "—",
                                    "Seguimiento": sig_lbl,
                                }
                            )
                            continue
                    wl_table_rows.append(
                        {
                            "Ticker": wl_t,
                            "Compañía": u_info["name"],
                            "Sector": u_info["sector"],
                            "Precio": "—",
                            "Var. %": "—",
                            "Dist. SMA 50": "—",
                            "Dist. SMA 200": "—",
                            "MACD": "—",
                            "RSI 14": "—",
                            "Seguimiento": "Sin escanear",
                        }
                    )

                st.dataframe(pd.DataFrame(wl_table_rows), use_container_width=True, hide_index=True)

                st.markdown("##### Visor Interactivo Watchlist — Gráfico en Tiempo Real e Indicadores")
                if (
                    "wl_chart_ticker_select" in st.session_state
                    and st.session_state["wl_chart_ticker_select"] not in st.session_state.watchlist_tickers
                ):
                    del st.session_state["wl_chart_ticker_select"]
                if (
                    "wl_remove_select" in st.session_state
                    and st.session_state["wl_remove_select"] not in st.session_state.watchlist_tickers
                ):
                    del st.session_state["wl_remove_select"]

                wl_v1, wl_v2 = st.columns([2.2, 1.2])
                with wl_v1:
                    wl_selected = st.selectbox(
                        "Acción de la Watchlist a visualizar",
                        options=st.session_state.watchlist_tickers,
                        format_func=lambda t: f"{t} — {wl_universe_info.get(t, {}).get('name', t)}",
                        key="wl_chart_ticker_select",
                    )
                with wl_v2:
                    st.write("")
                    wl_fetch_single = st.button(
                        f"Cargar / Actualizar gráfico ({timeframe})",
                        use_container_width=True,
                        key="wl_load_chart_btn",
                    )

                if wl_fetch_single and wl_selected:
                    single_batch = fetch_market_batch([wl_selected], timeframe=timeframe)
                    if single_batch["results"]:
                        now_ts = time.time()
                        st.session_state.watchlist_live_cache[f"{wl_selected.upper()}_{timeframe}"] = {
                            "response": single_batch["results"][0],
                            "market": "WATCHLIST",
                            "timeframe": timeframe,
                            "cached_at": now_ts,
                            "expires_at": now_ts + CACHE_TTL_SECONDS,
                        }
                        st.rerun()
                    elif single_batch["incidents"]:
                        st.warning(f"No se pudo descargar {wl_selected}: {single_batch['incidents'][0]['message']}")

                wl_target = wl_eval_by_ticker.get(wl_selected.upper()) if wl_selected else None
                if wl_target:
                    wm1, wm2, wm3, wm4, wm5, wm6 = st.columns(6)
                    wm1.metric(
                        f"Precio ({wl_target['currency']})",
                        f"{wl_target['price']:.2f}",
                        f"{wl_target['change_pct']:+.2f}%",
                    )
                    wm2.metric(
                        "SMA 50",
                        f"{wl_target['sma_50']:.2f}" if wl_target["sma_50"] is not None else "—",
                        f"{wl_target['dist_50']:+.2f}%" if wl_target["dist_50"] is not None else None,
                    )
                    wm3.metric(
                        "SMA 200",
                        f"{wl_target['sma_200']:.2f}" if wl_target["sma_200"] is not None else "—",
                        f"{wl_target['dist_200']:+.2f}%" if wl_target["dist_200"] is not None else None,
                    )
                    wm4.metric(
                        "MACD (12,26,9)",
                        f"{wl_target['macd_line']:+.2f}" if wl_target["macd_line"] is not None else "—",
                        (
                            f"Señal {wl_target['macd_signal']:+.2f} · "
                            f"{'Cruce ↑' if wl_target['is_macd_bullish_cross'] else ('Alcista' if wl_target['is_macd_bullish'] else 'Bajista')}"
                        )
                        if wl_target["macd_signal"] is not None
                        else None,
                    )
                    wm5.metric(
                        "RSI (14)",
                        f"{wl_target['rsi_14']:.1f}" if wl_target["rsi_14"] is not None else "—",
                        (
                            f"ATR {wl_target['atr_14']:.2f} · Vol {wl_target['volume_ratio']:.2f}x"
                            if wl_target["atr_14"] is not None
                            else f"Vol {wl_target['volume_ratio']:.2f}x"
                        ),
                    )
                    wm50, wm200 = get_strategy_matches(wl_target, strategy_mode)
                    if strategy_mode == "PULLBACK_MACD":
                        w_sig = (
                            "Confluencia + MACD ↑"
                            if (wm50 and wm200)
                            else ("SMA 50 + MACD ↑" if wm50 else ("SMA 200 + MACD ↑" if wm200 else "Sin señal"))
                        )
                    else:
                        w_sig = (
                            "Confluencia 50+200"
                            if (wm50 and wm200)
                            else ("SMA 50" if wm50 else ("SMA 200" if wm200 else "Sin señal"))
                        )
                    wm6.metric(
                        "Señal Pullback",
                        w_sig,
                        "Golden Cross" if wl_target["is_golden_cross"] else "SMA 50 ≤ 200",
                    )

                    render_ohlc_chart(
                        wl_target,
                        wl_threshold_val,
                        chart_key=f"wl_live_chart_{wl_target['ticker']}_{timeframe}",
                    )
                else:
                    st.info(
                        f"Aún no hay datos descargados para **{wl_selected}** en temporalidad **{timeframe}**. "
                        "Pulsa **Cargar / Actualizar gráfico** o **Escanear Watchlist**."
                    )

                wl_m1, wl_m2, wl_m3, wl_m4 = st.columns([1.8, 1.0, 1.0, 0.8])
                with wl_m1:
                    to_remove = st.selectbox(
                        "Quitar acción de Watchlist",
                        options=st.session_state.watchlist_tickers,
                        key="wl_remove_select",
                    )
                with wl_m2:
                    st.write("")
                    if st.button("Quitar seleccionada", use_container_width=True, key="wl_remove_btn"):
                        st.session_state.watchlist_tickers = [
                            t for t in st.session_state.watchlist_tickers if t != to_remove
                        ]
                        st.rerun()
                with wl_m3:
                    st.write("")
                    st.download_button(
                        "Exportar Watchlist JSON",
                        data=json.dumps(
                            {"name": "PullbackMonitor Watchlist", "tickers": st.session_state.watchlist_tickers},
                            indent=2,
                        ).encode("utf-8"),
                        file_name="watchlist_pullbacks.json",
                        mime="application/json",
                        use_container_width=True,
                    )
                with wl_m4:
                    st.write("")
                    if st.button("Vaciar", use_container_width=True, key="wl_clear_all_btn"):
                        st.session_state.watchlist_tickers = []
                        st.rerun()

                uploaded = st.file_uploader(
                    "Importar Watchlist (JSON / TXT / CSV)",
                    type=["json", "txt", "csv"],
                    key="wl_file_upload",
                )
                if uploaded is not None:
                    upload_sig = f"{uploaded.name}:{uploaded.size}"
                    if st.session_state.get("last_wl_upload_sig") != upload_sig:
                        imported = parse_watchlist_text(
                            uploaded.read().decode("utf-8", errors="ignore")
                        )
                        st.session_state.last_wl_upload_sig = upload_sig
                        if imported:
                            st.session_state.watchlist_tickers = imported
                            for k in list(st.session_state.market_cache.keys()):
                                if k.startswith("WATCHLIST_"):
                                    del st.session_state.market_cache[k]
                            st.rerun()

        # Segunda fila de controles
        c_thresh, c_search, c_sector, c_all, c_btn_start, c_btn_stop = st.columns(
            [1.0, 1.4, 1.2, 1.1, 1.0, 0.8]
        )

        with c_thresh:
            proximity_threshold = st.number_input(
                "Rango ±%",
                min_value=0.1,
                max_value=10.0,
                value=1.5,
                step=0.1,
                disabled=(strategy_mode == "BOUNCE"),
                key="proximity_threshold",
            )

        universe = get_tickers_by_market(market_id, st.session_state.watchlist_tickers)
        ticker_info_map = {t["ticker"]: t for t in universe}
        sectors = sorted({t["sector"] for t in universe})

        with c_search:
            search_query = st.text_input(
                "Buscar ticker o empresa",
                placeholder="Ej. ITX, SAP, AAPL...",
                key="search_query",
            )

        with c_sector:
            selected_sector = st.selectbox(
                "Sector",
                options=["Todos los sectores"] + sectors,
                key="selected_sector",
            )

        with c_all:
            st.write("")
            show_all = st.checkbox("Mostrar todo el índice", value=False, key="show_all")

        with c_btn_start:
            st.write("")
            start_clicked = st.button(
                "Iniciar Escaneo",
                type="primary",
                disabled=len(universe) == 0,
                use_container_width=True,
            )

        with c_btn_stop:
            st.write("")
            stop_clicked = st.button("Detener", use_container_width=True)

        # Tercera fila: Filtros Técnicos Avanzados
        f_gc, f_macd, f_vol, f_rsi, f_atr = st.columns([1.1, 1.1, 1.1, 1.2, 1.1])
        with f_gc:
            st.write("")
            only_golden_cross = st.checkbox("Golden Cross (SMA 50 > 200)", value=False, key="only_gc")
        with f_macd:
            st.write("")
            only_macd_cross = st.checkbox("Cruce MACD (al alza)", value=False, key="only_macd_cross")
        with f_vol:
            min_vol_label = st.selectbox(
                "Volumen Rel. Mínimo",
                options=["Cualquiera", "≥ 1,2x", "≥ 1,5x", "≥ 2,0x"],
                key="min_vol_filter",
            )
            min_vol_map = {"Cualquiera": 0.0, "≥ 1,2x": 1.2, "≥ 1,5x": 1.5, "≥ 2,0x": 2.0}
            min_vol_val = min_vol_map[min_vol_label]
        with f_rsi:
            rsi_filter_label = st.selectbox(
                "Filtro RSI (14)",
                options=["Todos", "RSI < 55 (No sobrecompra)", "RSI 35-55 (Zona pullback)"],
                key="rsi_filter",
            )
        with f_atr:
            atr_filter_label = st.selectbox(
                "Distancia Máx. ATR",
                options=["Todas", "≤ 0,5 ATR", "≤ 1,0 ATR", "≤ 1,5 ATR"],
                key="atr_filter",
            )
            atr_filter_map = {"Todas": 0.0, "≤ 0,5 ATR": 0.5, "≤ 1,0 ATR": 1.0, "≤ 1,5 ATR": 1.5}
            max_atr_val = atr_filter_map[atr_filter_label]

        if stop_clicked:
            st.session_state.stop_requested = True
            st.session_state.last_scan_status = "STOPPED"

        if start_clicked and universe:
            st.session_state.stop_requested = False
            st.session_state.last_scan_status = "SCANNING"
            progress_bar = st.progress(0, text=f"Analizando 0 de {len(universe)} acciones...")
            status_placeholder = st.empty()

            def _on_progress(processed: int, total: int, incidents_count: int) -> None:
                pct = int((processed / max(1, total)) * 100)
                progress_bar.progress(
                    pct,
                    text=f"Analizando {processed} de {total} acciones...",
                )
                if incidents_count > 0:
                    status_placeholder.caption(f"Incidencias de red detectadas: {incidents_count}")

            batch_res = fetch_market_batch(
                [t["ticker"] for t in universe],
                timeframe=timeframe,
                on_progress=_on_progress,
                should_stop=lambda: bool(st.session_state.stop_requested),
            )

            set_cache_entry(
                market_id,
                timeframe,
                batch_res["results"],
                batch_res["incidents"],
            )
            st.session_state.last_scan_status = "STOPPED" if batch_res["aborted"] else "COMPLETED"
            progress_bar.empty()
            status_placeholder.empty()

        cache_entry = get_valid_cache_entry(market_id, timeframe)

        if not cache_entry:
            st.info(
                f"Listo para escanear **{MARKETS_METADATA[market_id]['label']}** en temporalidad "
                f"**{timeframe}**. Pulsa **Iniciar Escaneo** para descargar las series OHLC reales de Yahoo Finance."
            )
        else:
            all_rows, recalc_ms = evaluate_cached_market(
                cache_entry["responses"],
                ticker_info_map,
                market_id,
                float(proximity_threshold),
            )

            total_analyzed = len(all_rows)
            sma_50_hits = 0
            sma_200_hits = 0
            total_pullbacks = 0

            for r in all_rows:
                m50, m200 = get_strategy_matches(r, strategy_mode)
                if m50:
                    sma_50_hits += 1
                if m200:
                    sma_200_hits += 1

                if (
                    (sma_filter_label == "Todas" and (m50 or m200))
                    or (sma_filter_label == "SMA 50" and m50)
                    or (sma_filter_label == "SMA 200" and m200)
                ):
                    total_pullbacks += 1

            k1, k2, k3, k4 = st.columns(4)
            k1.metric("Total Analizados", f"{total_analyzed} / {len(universe)}")
            k2.metric("Pullbacks Detectados", str(total_pullbacks))
            k3.metric("En SMA 50", str(sma_50_hits))
            k4.metric("En SMA 200", str(sma_200_hits))

            q = search_query.strip().lower()
            filtered_rows: List[Dict[str, Any]] = []

            for r in all_rows:
                if selected_sector != "Todos los sectores" and r["sector"] != selected_sector:
                    continue
                if q and q not in r["ticker"].lower() and q not in r["name"].lower():
                    continue
                if only_golden_cross and not r["is_golden_cross"]:
                    continue
                if only_macd_cross and not r["is_macd_bullish_cross"]:
                    continue
                if min_vol_val > 0 and r["volume_ratio"] < min_vol_val:
                    continue
                if rsi_filter_label.startswith("RSI < 55"):
                    if r["rsi_14"] is None or r["rsi_14"] >= 55:
                        continue
                elif rsi_filter_label.startswith("RSI 35-55"):
                    if r["rsi_14"] is None or r["rsi_14"] < 35 or r["rsi_14"] > 55:
                        continue

                atr_dist = get_min_atr_dist(r, sma_filter_label)
                if max_atr_val > 0:
                    if atr_dist is None or abs(atr_dist) > max_atr_val:
                        continue

                m50, m200 = get_strategy_matches(r, strategy_mode)

                if not show_all:
                    if sma_filter_label == "SMA 50" and not m50:
                        continue
                    if sma_filter_label == "SMA 200" and not m200:
                        continue
                    if sma_filter_label == "Todas" and not (m50 or m200):
                        continue

                if m50 and m200:
                    media_badge = "Confluencia + MACD ↑" if strategy_mode == "PULLBACK_MACD" else "Confluencia 50 + 200"
                elif m50:
                    media_badge = "SMA 50 + MACD ↑" if strategy_mode == "PULLBACK_MACD" else "SMA 50"
                elif m200:
                    media_badge = "SMA 200 + MACD ↑" if strategy_mode == "PULLBACK_MACD" else "SMA 200"
                else:
                    media_badge = "Sin señal"

                d50_abs = abs(r["dist_50"]) if r["dist_50"] is not None else 1e9
                d200_abs = abs(r["dist_200"]) if r["dist_200"] is not None else 1e9
                if sma_filter_label == "SMA 50":
                    min_dist = d50_abs
                elif sma_filter_label == "SMA 200":
                    min_dist = d200_abs
                else:
                    min_dist = min(d50_abs, d200_abs)

                enriched = dict(r)
                enriched["media_badge"] = media_badge
                enriched["min_dist"] = min_dist
                enriched["display_atr_dist"] = atr_dist
                filtered_rows.append(enriched)

            filtered_rows.sort(key=lambda item: item["min_dist"])

            st.caption(
                f"Caché activo `{cache_entry['key']}` (TTL 5 min) · "
                f"Recálculo en memoria: **{recalc_ms:.2f} ms** · "
                f"Mostrando **{len(filtered_rows)}** valores"
            )

            if not filtered_rows:
                st.warning(
                    "Ningún valor coincide con los filtros actuales. Prueba ampliando el rango ±%, "
                    "relajando RSI/Volumen/ATR o activando «Mostrar todo el índice»."
                )
            else:
                df_display = pd.DataFrame(
                    [
                        {
                            "Yahoo": r["yahoo_url"],
                            "Ticker": r["ticker"],
                            "Compañía": r["name"],
                            "Sector": r["sector"],
                            "Precio": r["price"],
                            "Var. %": r["change_pct"],
                            "SMA 50": r["sma_50"],
                            "Dist. SMA 50": (
                                f"{r['dist_50']:+.2f}%" if r["dist_50"] is not None else "—"
                            ),
                            "Banda 50": build_centered_microbar(r["dist_50"], float(proximity_threshold)),
                            "SMA 200": r["sma_200"],
                            "Dist. SMA 200": (
                                f"{r['dist_200']:+.2f}%" if r["dist_200"] is not None else "—"
                            ),
                            "Banda 200": build_centered_microbar(r["dist_200"], float(proximity_threshold)),
                            "RSI 14": r["rsi_14"],
                            "MACD": r["macd_line"],
                            "Cruce MACD": (
                                "Cruce ↑"
                                if r["is_macd_bullish_cross"]
                                else ("Alcista" if r["is_macd_bullish"] else "Bajista")
                            )
                            if r["macd_line"] is not None
                            else "—",
                            "Dist. ATR": (
                                f"{r['display_atr_dist']:+.2f}" if r["display_atr_dist"] is not None else "—"
                            ),
                            "Media Objetivo": r["media_badge"],
                            "Vol. Rel.": r["volume_ratio"],
                        }
                        for r in filtered_rows
                    ]
                )

                def _color_dist(val: Any) -> str:
                    if not isinstance(val, str) or not val.endswith("%"):
                        return ""
                    try:
                        num = float(val.replace("%", ""))
                    except ValueError:
                        return ""
                    if abs(num) <= float(proximity_threshold):
                        return "color: #059669; font-weight: 600;" if num >= 0 else "color: #D97706; font-weight: 600;"
                    return ""

                def _color_macd_cross(val: Any) -> str:
                    if val == "Cruce ↑":
                        return "color: #059669; font-weight: 700;"
                    if val == "Alcista":
                        return "color: #1D4ED8; font-weight: 600;"
                    return "color: #64748B;"

                def _color_media(val: Any) -> str:
                    if isinstance(val, str) and val.startswith("Confluencia"):
                        return "background-color: #FEF3C7; color: #B45309; font-weight: 600;"
                    if isinstance(val, str) and val.startswith("SMA 50"):
                        return "background-color: #EFF6FF; color: #1D4ED8; font-weight: 600;"
                    if isinstance(val, str) and val.startswith("SMA 200"):
                        return "background-color: #EEF2FF; color: #4338CA; font-weight: 600;"
                    return "color: #64748B;"

                styled_df = (
                    df_display.style.format(
                        {
                            "Precio": "{:.2f}",
                            "Var. %": "{:+.2f}%",
                            "SMA 50": lambda x: f"{x:.2f}" if pd.notna(x) else "—",
                            "SMA 200": lambda x: f"{x:.2f}" if pd.notna(x) else "—",
                            "RSI 14": lambda x: f"{x:.1f}" if pd.notna(x) else "—",
                            "MACD": lambda x: f"{x:+.2f}" if pd.notna(x) else "—",
                            "Vol. Rel.": "{:.2f}x",
                        }
                    )
                    .map(_color_dist, subset=["Dist. SMA 50", "Dist. SMA 200"])
                    .map(_color_macd_cross, subset=["Cruce MACD"])
                    .map(_color_media, subset=["Media Objetivo"])
                )

                st.dataframe(
                    styled_df,
                    use_container_width=True,
                    hide_index=True,
                    column_config={
                        "Yahoo": st.column_config.LinkColumn(
                            "Gráfico",
                            help="Abrir gráfico en Yahoo Finance",
                            display_text="Yahoo ↗",
                        ),
                    },
                )

                # Exportación: CSV Excel ES y Copiar Tickers TradingView
                exp_col1, exp_col2 = st.columns([1, 2])
                with exp_col1:
                    csv_bytes = build_excel_es_csv(filtered_rows, market_id, timeframe)
                    st.download_button(
                        label="Exportar CSV (Excel en español)",
                        data=csv_bytes,
                        file_name=f"pullbacks_{market_id.lower()}_{timeframe}.csv",
                        mime="text/csv",
                        use_container_width=True,
                    )
                with exp_col2:
                    tv_tickers = ",".join(format_tradingview_symbol(r["ticker"]) for r in filtered_rows)
                    with st.expander(f"Copiar Tickers para TradingView ({len(filtered_rows)})"):
                        st.code(tv_tickers, language=None)

                # Auditoría matemática, Gráfico OHLC interactivo y Backtest rápido por valor
                with st.expander("Gráfico OHLC, Auditoría Matemática y Backtest Histórico", expanded=True):
                    selected_t = st.selectbox(
                        "Selecciona un ticker para inspeccionar gráfico, fórmulas y backtest",
                        options=[r["ticker"] for r in filtered_rows],
                    )
                    target = next(r for r in filtered_rows if r["ticker"] == selected_t)

                    wl_action_col1, wl_action_col2 = st.columns([3, 1])
                    with wl_action_col1:
                        rsi_txt = f"{target['rsi_14']:.1f}" if target["rsi_14"] is not None else "—"
                        macd_txt = (
                            f"{target['macd_line']:+.2f} / Señal {target['macd_signal']:+.2f} "
                            f"({'Cruce ↑' if target['is_macd_bullish_cross'] else ('Alcista' if target['is_macd_bullish'] else 'Bajista')})"
                            if target["macd_line"] is not None and target["macd_signal"] is not None
                            else "—"
                        )
                        atr_txt = f"{target['atr_14']:.2f}" if target["atr_14"] is not None else "—"
                        gc_txt = "Sí (SMA 50 > 200)" if target["is_golden_cross"] else "No"
                        st.write(
                            f"**{target['ticker']} — {target['name']}** | Velas válidas: `{target['valid_candles']}` | "
                            f"RSI(14): `{rsi_txt}` · MACD: `{macd_txt}` · ATR(14): `{atr_txt}` · Golden Cross: `{gc_txt}`"
                        )
                    with wl_action_col2:
                        in_wl = target["ticker"] in st.session_state.watchlist_tickers
                        if st.button(
                            "★ Quitar de Watchlist" if in_wl else "☆ Añadir a Watchlist",
                            key=f"wl_btn_{target['ticker']}",
                            use_container_width=True,
                        ):
                            if in_wl:
                                st.session_state.watchlist_tickers = [
                                    t for t in st.session_state.watchlist_tickers if t != target["ticker"]
                                ]
                            else:
                                st.session_state.watchlist_tickers = st.session_state.watchlist_tickers + [target["ticker"]]
                            st.rerun()

                    render_ohlc_chart(
                        target,
                        float(proximity_threshold),
                        chart_key=f"main_audit_chart_{target['ticker']}_{timeframe}",
                    )

                    d50, d200 = target["diag_50"], target["diag_200"]
                    bt = target["backtest"]
                    col_d1, col_d2 = st.columns(2)
                    with col_d1:
                        st.markdown("**Verificación SMA 50 & Backtest**")
                        if d50.sma_current is None:
                            st.caption("Velas insuficientes (< 50).")
                        else:
                            st.write(f"- SMA actual: `{d50.sma_current:.2f}` vs hace 10 velas: `{d50.sma_10_ago:.2f}` (Pendiente OK: `{d50.slope_positive_or_flat}`)")
                            st.write(f"- Precio > SMA hace 5-15 velas: `{d50.was_above_in_5_to_15}` | Toque: `{d50.touched_recently}` | Rebote: `{d50.closed_strictly_above}`")
                            if bt.sma_50.events_count > 0:
                                st.write(
                                    f"- **Backtest ({bt.sma_50.events_count} rebotes)**: "
                                    f"+5v Acierto `{bt.sma_50.win_rate_5_pct:.0f}%` (Media `{bt.sma_50.avg_return_5_pct:+.2f}%`) · "
                                    f"+10v Acierto `{bt.sma_50.win_rate_10_pct:.0f}%` (Media `{bt.sma_50.avg_return_10_pct:+.2f}%`)"
                                )
                    with col_d2:
                        st.markdown("**Verificación SMA 200 & Backtest**")
                        if d200.sma_current is None:
                            st.caption("Velas insuficientes (< 200).")
                        else:
                            st.write(f"- SMA actual: `{d200.sma_current:.2f}` vs hace 10 velas: `{d200.sma_10_ago:.2f}` (Pendiente OK: `{d200.slope_positive_or_flat}`)")
                            st.write(f"- Precio > SMA hace 5-15 velas: `{d200.was_above_in_5_to_15}` | Toque: `{d200.touched_recently}` | Rebote: `{d200.closed_strictly_above}`")
                            if bt.sma_200.events_count > 0:
                                st.write(
                                    f"- **Backtest ({bt.sma_200.events_count} rebotes)**: "
                                    f"+5v Acierto `{bt.sma_200.win_rate_5_pct:.0f}%` (Media `{bt.sma_200.avg_return_5_pct:+.2f}%`) · "
                                    f"+10v Acierto `{bt.sma_200.win_rate_10_pct:.0f}%` (Media `{bt.sma_200.avg_return_10_pct:+.2f}%`)"
                                )

            # Panel desplegable discreto con tickers omitidos
            omitted_items: List[Dict[str, str]] = []
            for inc in cache_entry["incidents"]:
                info = ticker_info_map.get(inc["ticker"])
                omitted_items.append(
                    {
                        "Ticker": inc["ticker"],
                        "Compañía": info["name"] if info else inc["ticker"],
                        "Motivo": "Error de red",
                        "Detalle": inc["message"],
                    }
                )
            for r in all_rows:
                if r["valid_candles"] < SMA_LONG_PERIOD:
                    omitted_items.append(
                        {
                            "Ticker": r["ticker"],
                            "Compañía": r["name"],
                            "Motivo": "Historial insuficiente",
                            "Detalle": f"{r['valid_candles']} velas válidas (< 200 requeridas para SMA 200)",
                        }
                    )

            if omitted_items:
                with st.expander(f"Tickers omitidos o con historial parcial ({len(omitted_items)})"):
                    st.dataframe(pd.DataFrame(omitted_items), use_container_width=True, hide_index=True)

    with tab_universe:
        st.subheader("Universo Maestro Completo (580 valores sin recortes)")
        u_market = st.selectbox(
            "Índice a inspeccionar",
            options=["IBEX35", "DAX", "SP500", "EUROPE"],
            format_func=lambda m: str(MARKETS_METADATA[m]["label"]),
            key="universe_market",
        )
        u_list = get_tickers_by_market(u_market)
        u_query = st.text_input("Filtrar universo por ticker o nombre", key="universe_search").strip().lower()
        u_filtered = [
            x for x in u_list if not u_query or u_query in x["ticker"].lower() or u_query in x["name"].lower()
        ]
        st.caption(f"Mostrando {len(u_filtered)} de {len(u_list)} valores")
        st.dataframe(pd.DataFrame(u_filtered), use_container_width=True, hide_index=True)

    with tab_methodology:
        st.subheader("Metodología de Pullbacks sobre SMA 50 y SMA 200")
        st.markdown(
            """
            - **Modo A — Zona de Proximidad (±%)**: Exige pendiente alcista o neutra (`SMA actual >= SMA hace 10 velas`),
              cotización previa sobre la media hace 5–15 velas y distancia porcentual dentro de `[-umbral%, +umbral%]`.
            - **Modo B — Toque y Rebote Estricto**: Exige toque o perforación leve en el mínimo de la vela actual o anterior
              (`Low <= SMA * 1.002`) viniendo de cotizar por encima hace 5–15 velas, con cierre actual estrictamente superior (`Close > SMA`).
            - **Modo C — Pullback + Cruce MACD (al alza)**: Combina la señal de pullback en SMA 50/200 (Modo A o Modo B)
              con un cruce alcista confirmado del MACD `(12, 26, 9)` (`MACD anterior ≤ Señal anterior` y `MACD actual > Señal actual`).
            - **Visor Interactivo Watchlist**: Permite seleccionar cualquier acción de tu lista de seguimiento para visualizar
              su gráfico OHLC en tiempo real con SMA 50/200, MACD (12, 26, 9), RSI (14) y ATR (14).
            - **Filtros Técnicos Avanzados**: Golden Cross (`SMA 50 > SMA 200`), Cruce MACD al alza, RSI(14) de Wilder,
              distancia normalizada en ATR(14) y volumen relativo mínimo sobre media de 20 velas.
            - **Backtest Rápido Histórico**: Mide sobre la serie descargada la tasa de acierto y retorno medio a +5 y +10 velas tras cada rebote Modo B.
            - **Fuente Única de Verdad (`data/tickers.json`)**: Los 580 tickers oficiales son compartidos entre TypeScript y Python, validados por GitHub Actions CI.
            """
        )


if __name__ == "__main__":
    main()
