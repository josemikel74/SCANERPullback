"""Listados maestros cargados desde data/tickers.json (Fuente Única de Verdad) para IBEX 35, DAX 40, S&P 500, Europa y Watchlist."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "tickers.json"
with _DATA_PATH.open("r", encoding="utf-8") as _fh:
    _RAW_DATA: Dict[str, List[Dict[str, str]]] = json.load(_fh)

IBEX_35_TICKERS: List[Dict[str, str]] = _RAW_DATA["IBEX35"]
DAX_40_TICKERS: List[Dict[str, str]] = _RAW_DATA["DAX"]
SP500_TICKERS: List[Dict[str, str]] = _RAW_DATA["SP500"]
EUROPE_TICKERS: List[Dict[str, str]] = IBEX_35_TICKERS + DAX_40_TICKERS
ALL_MASTER_TICKERS: List[Dict[str, str]] = IBEX_35_TICKERS + DAX_40_TICKERS + SP500_TICKERS

MASTER_TICKER_MAP: Dict[str, Dict[str, str]] = {
    item["ticker"].upper(): item for item in ALL_MASTER_TICKERS
}

MARKETS_METADATA: Dict[str, Dict[str, object]] = {
    "IBEX35": {
        "id": "IBEX35",
        "label": "IBEX 35 (España)",
        "shortLabel": "IBEX 35",
        "country": "España · Bolsas y Mercados Españoles",
        "currency": "EUR",
        "currencySymbol": "€",
        "suffix": ".MC",
        "totalExpected": len(IBEX_35_TICKERS),
    },
    "DAX": {
        "id": "DAX",
        "label": "DAX 40 (Alemania)",
        "shortLabel": "DAX 40",
        "country": "Alemania · Xetra Frankfurt",
        "currency": "EUR",
        "currencySymbol": "€",
        "suffix": ".DE",
        "totalExpected": len(DAX_40_TICKERS),
    },
    "SP500": {
        "id": "SP500",
        "label": "S&P 500 (EE. UU.)",
        "shortLabel": "S&P 500",
        "country": "Estados Unidos · NYSE / NASDAQ",
        "currency": "USD",
        "currencySymbol": "$",
        "suffix": "",
        "totalExpected": len(SP500_TICKERS),
    },
    "EUROPE": {
        "id": "EUROPE",
        "label": "Europa Combinado (IBEX 35 + DAX 40)",
        "shortLabel": "Europa",
        "country": "España + Alemania · BME y Xetra",
        "currency": "EUR",
        "currencySymbol": "€",
        "suffix": ".MC/.DE",
        "totalExpected": len(EUROPE_TICKERS),
    },
    "WATCHLIST": {
        "id": "WATCHLIST",
        "label": "Watchlist Personalizada",
        "shortLabel": "Watchlist",
        "country": "Selección propia multi-índice",
        "currency": "MIXED",
        "currencySymbol": "$",
        "suffix": "",
        "totalExpected": 0,
    },
}


def infer_currency_symbol(ticker: str, fallback: str = "$") -> str:
    upper = ticker.upper()
    if upper.endswith((".MC", ".DE", ".PA", ".AS", ".MI", ".BR", ".LS")):
        return "€"
    return fallback


def resolve_ticker_info(ticker: str) -> Dict[str, str]:
    normalized = ticker.strip().upper()
    known = MASTER_TICKER_MAP.get(normalized)
    if known:
        return known
    return {
        "ticker": normalized,
        "name": normalized,
        "sector": "Personalizado",
    }


def get_tickers_by_market(
    market_id: str, custom_watchlist: Optional[List[str]] = None
) -> List[Dict[str, str]]:
    if market_id == "IBEX35":
        return IBEX_35_TICKERS
    if market_id == "DAX":
        return DAX_40_TICKERS
    if market_id == "SP500":
        return SP500_TICKERS
    if market_id == "EUROPE":
        return EUROPE_TICKERS
    if market_id == "WATCHLIST":
        return [resolve_ticker_info(t) for t in (custom_watchlist or []) if t.strip()]
    return []
