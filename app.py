from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import pandas as pd
import streamlit as st

from streamlit_core.indicators import (
    SMA_LONG_PERIOD,
    SMA_SHORT_PERIOD,
    evaluate_pullback_signals,
    sanitize_candles,
)
from streamlit_core.tickers_data import (
    DAX_40_TICKERS,
    IBEX_35_TICKERS,
    MARKETS_METADATA,
    SP500_TICKERS,
    get_tickers_by_market,
)
from streamlit_core.yahoo_service import fetch_market_batch

CACHE_TTL_SECONDS = 300  # 5 minutos

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


def evaluate_cached_market(
    responses: List[Dict[str, Any]],
    ticker_info_map: Dict[str, Dict[str, str]],
    market_id: str,
    proximity_threshold_pct: float,
) -> tuple[List[Dict[str, Any]], float]:
    t0 = time.perf_counter()
    rows: List[Dict[str, Any]] = []
    symbol = str(MARKETS_METADATA[market_id]["currencySymbol"])

    for res in responses:
        ticker = res["ticker"]
        info = ticker_info_map.get(ticker)
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
                "sma_50": eval_out.sma_50,
                "sma_200": eval_out.sma_200,
                "dist_50": eval_out.distance_sma_50_pct,
                "dist_200": eval_out.distance_sma_200_pct,
                "prox_50": eval_out.proximity_match_50,
                "prox_200": eval_out.proximity_match_200,
                "bounce_50": eval_out.bounce_match_50,
                "bounce_200": eval_out.bounce_match_200,
                "diag_50": eval_out.diagnostics_50,
                "diag_200": eval_out.diagnostics_200,
                "volume_ratio": vol_ratio,
                "valid_candles": eval_out.valid_candles_count,
                "raw_candles": len(res["candles"]),
            }
        )

    elapsed_ms = max(0.1, round((time.perf_counter() - t0) * 1000.0, 2))
    return rows, elapsed_ms


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
        "Volumen Relativo",
        "Velas Validas",
        "Media Objetivo",
    ]
    lines = [";".join(headers)]
    for r in rows:
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
                    fmt_es(r["volume_ratio"]),
                    str(r["valid_candles"]),
                    r["media_badge"],
                ]
            )
        )
    content = "\ufeff" + "\r\n".join(lines)
    return content.encode("utf-8")


def main() -> None:
    init_session_state()

    st.title("Monitor Pullback SMA — IBEX 35, DAX 40 y S&P 500")
    st.caption(
        "Sistema profesional en tiempo real para detectar pullbacks a SMA 50 y SMA 200 · "
        "Datos Yahoo Finance · Caché en memoria (TTL 5 min)"
    )

    tab_scanner, tab_universe, tab_methodology = st.tabs(
        ["Escáner Pullback", "Universo de Índices", "Metodología SMA"]
    )

    with tab_scanner:
        # Barra de controles superior
        col_m, col_tf, col_strat, col_sma = st.columns([1.4, 1.0, 1.8, 1.1])

        with col_m:
            market_options = ["IBEX35", "DAX", "SP500"]
            market_labels = {
                "IBEX35": f"IBEX 35 ({len(IBEX_35_TICKERS)})",
                "DAX": f"DAX 40 ({len(DAX_40_TICKERS)})",
                "SP500": f"S&P 500 ({len(SP500_TICKERS)})",
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
                options=["Modo A: Zona de Proximidad", "Modo B: Toque y Rebote Estricto"],
                horizontal=True,
                key="selected_strategy",
            )
            is_proximity_mode = strategy_label.startswith("Modo A")

        with col_sma:
            sma_filter_label = st.selectbox(
                "Filtro de Media",
                options=["Todas", "SMA 50", "SMA 200"],
                key="selected_sma_filter",
            )

        # Segunda fila de controles: umbral ±%, búsqueda, sector, botones Iniciar / Detener
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
                disabled=not is_proximity_mode,
                key="proximity_threshold",
            )

        universe = get_tickers_by_market(market_id)
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
            start_clicked = st.button("Iniciar Escaneo", type="primary", use_container_width=True)

        with c_btn_stop:
            st.write("")
            stop_clicked = st.button("Detener", use_container_width=True)

        if stop_clicked:
            st.session_state.stop_requested = True
            st.session_state.last_scan_status = "STOPPED"

        if start_clicked:
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

            # Cálculo de KPIs globales
            total_analyzed = len(all_rows)
            sma_50_hits = 0
            sma_200_hits = 0
            total_pullbacks = 0

            for r in all_rows:
                m50 = r["prox_50"] if is_proximity_mode else r["bounce_50"]
                m200 = r["prox_200"] if is_proximity_mode else r["bounce_200"]
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

            # Filtrado y enriquecimiento de filas
            q = search_query.strip().lower()
            filtered_rows: List[Dict[str, Any]] = []

            for r in all_rows:
                if selected_sector != "Todos los sectores" and r["sector"] != selected_sector:
                    continue
                if q and q not in r["ticker"].lower() and q not in r["name"].lower():
                    continue

                m50 = r["prox_50"] if is_proximity_mode else r["bounce_50"]
                m200 = r["prox_200"] if is_proximity_mode else r["bounce_200"]

                if not show_all:
                    if sma_filter_label == "SMA 50" and not m50:
                        continue
                    if sma_filter_label == "SMA 200" and not m200:
                        continue
                    if sma_filter_label == "Todas" and not (m50 or m200):
                        continue

                if m50 and m200:
                    media_badge = "Confluencia 50 + 200"
                elif m50:
                    media_badge = "SMA 50"
                elif m200:
                    media_badge = "SMA 200"
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
                filtered_rows.append(enriched)

            # Orden por defecto: menor distancia absoluta a la SMA
            filtered_rows.sort(key=lambda item: item["min_dist"])

            st.caption(
                f"Caché activo `{cache_entry['key']}` (TTL 5 min) · "
                f"Recálculo en memoria: **{recalc_ms:.2f} ms** · "
                f"Mostrando **{len(filtered_rows)}** valores"
            )

            if not filtered_rows:
                st.warning(
                    "Ningún valor coincide con los filtros actuales. Prueba ampliando el rango ±% "
                    "o activando «Mostrar todo el índice»."
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

                def _color_media(val: Any) -> str:
                    if val == "Confluencia 50 + 200":
                        return "background-color: #FEF3C7; color: #B45309; font-weight: 600;"
                    if val == "SMA 50":
                        return "background-color: #EFF6FF; color: #1D4ED8; font-weight: 600;"
                    if val == "SMA 200":
                        return "background-color: #EEF2FF; color: #4338CA; font-weight: 600;"
                    return "color: #64748B;"

                styled_df = (
                    df_display.style.format(
                        {
                            "Precio": "{:.2f}",
                            "Var. %": "{:+.2f}%",
                            "SMA 50": lambda x: f"{x:.2f}" if pd.notna(x) else "—",
                            "SMA 200": lambda x: f"{x:.2f}" if pd.notna(x) else "—",
                            "Vol. Rel.": "{:.2f}x",
                        }
                    )
                    .map(_color_dist, subset=["Dist. SMA 50", "Dist. SMA 200"])
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

                # Auditoría matemática por valor seleccionado
                with st.expander("Auditoría matemática detallada por valor"):
                    selected_t = st.selectbox(
                        "Selecciona un ticker para revisar fórmulas SMA 50 / SMA 200",
                        options=[r["ticker"] for r in filtered_rows],
                    )
                    target = next(r for r in filtered_rows if r["ticker"] == selected_t)
                    st.write(
                        f"**{target['ticker']} — {target['name']}** | Velas válidas: `{target['valid_candles']}` | "
                        f"OHLC: O `{target['open']:.2f}` · H `{target['high']:.2f}` · L `{target['low']:.2f}` · C `{target['price']:.2f}`"
                    )
                    d50, d200 = target["diag_50"], target["diag_200"]
                    col_d1, col_d2 = st.columns(2)
                    with col_d1:
                        st.markdown("**Verificación SMA 50**")
                        if d50.sma_current is None:
                            st.caption("Velas insuficientes (< 50).")
                        else:
                            st.write(f"- SMA actual: `{d50.sma_current:.2f}` vs hace 10 velas: `{d50.sma_10_ago:.2f}` (Pendiente OK: `{d50.slope_positive_or_flat}`)")
                            st.write(f"- Precio > SMA hace 5-15 velas: `{d50.was_above_in_5_to_15}`")
                            st.write(f"- Toque (`Low <= SMA * 1.002`): `{d50.touched_recently}` | Rebote (`Close > SMA`): `{d50.closed_strictly_above}`")
                    with col_d2:
                        st.markdown("**Verificación SMA 200**")
                        if d200.sma_current is None:
                            st.caption("Velas insuficientes (< 200).")
                        else:
                            st.write(f"- SMA actual: `{d200.sma_current:.2f}` vs hace 10 velas: `{d200.sma_10_ago:.2f}` (Pendiente OK: `{d200.slope_positive_or_flat}`)")
                            st.write(f"- Precio > SMA hace 5-15 velas: `{d200.was_above_in_5_to_15}`")
                            st.write(f"- Toque (`Low <= SMA * 1.002`): `{d200.touched_recently}` | Rebote (`Close > SMA`): `{d200.closed_strictly_above}`")

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
            options=["IBEX35", "DAX", "SP500"],
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
            - **Compatibilidad Dual**: Este repositorio puede ejecutarse tanto en **Streamlit Cloud** (`streamlit run app.py`)
              como en hosting estático **Vite + React + TypeScript** (`npm run build`).
            """
        )


if __name__ == "__main__":
    main()
