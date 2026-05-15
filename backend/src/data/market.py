"""yfinance-backed market data client."""

from datetime import date
from typing import Any

import yfinance as yf

from src.models.market import PriceBar, PriceHistory, TickerInfo

# ---------------------------------------------------------------------------
# ETF sector inference
# ---------------------------------------------------------------------------

# yfinance `category` field sometimes gives a clean sector name for ETFs.
_ETF_CATEGORY_KEYWORDS: list[tuple[str, str]] = [
    ("Information Technology", "technology"),
    ("Health Care", "health"),
    ("Energy", "energy"),
    ("Financials", "financial"),
    ("Utilities", "utilities"),
    ("Communication Services", "communication"),
    ("Real Estate", "real estate"),
    ("Industrials", "industrials"),
    ("Materials", "materials"),
    ("Consumer Discretionary", "consumer cyclical"),
    ("Consumer Staples", "consumer defensive"),
]

# Keyword patterns matched against the ETF's longName (lowercased).
_ETF_NAME_PATTERNS: list[tuple[str, list[str]]] = [
    (
        "Information Technology",
        [
            "information tech",
            "technology select",
            "technology etf",
            "semiconductor",
            "software",
            "cybersecurity",
            "artificial intel",
            "robotics",
            "cloud comput",
            "fintech",
        ],
    ),
    (
        "Health Care",
        [
            "health care",
            "healthcare",
            "biotech",
            "biotechnology",
            "pharmaceutical",
            "pharma",
            "medical device",
            "genomic",
            "oncology",
        ],
    ),
    (
        "Energy",
        [
            "energy select",
            "oil & gas",
            "oil and gas",
            "exploration & prod",
            "clean energy",
            "solar",
            "wind power",
            "mlp",
        ],
    ),
    (
        "Financials",
        [
            "financial select",
            "banking sector",
            "bank index",
            "finance select",
            "kbw bank",
            "insurance sector",
        ],
    ),
    (
        "Consumer Discretionary",
        [
            "consumer discret",
            "consumer cycl",
            "retail select",
            "e-commerce",
        ],
    ),
    ("Consumer Staples", ["consumer staple", "consumer def", "food & bev"]),
    (
        "Industrials",
        [
            "industrial select",
            "aerospace & defense",
            "transportation select",
            "infrastructure",
        ],
    ),
    ("Materials", ["materials select", "metals & mining", "gold miner"]),
    ("Real Estate", ["real estate", "reit", "realty"]),
    ("Utilities", ["utilities select", "utility select"]),
    ("Communication Services", ["communication serv", "telecom select"]),
    (
        "Fixed Income",
        [
            "treasury bond",
            "corporate bond",
            "municipal bond",
            "aggregate bond",
            "bond etf",
            "fixed income",
            "bond index",
            "inflation-protected",
        ],
    ),
    (
        "Commodities",
        [
            "gold trust",
            "gold etf",
            "silver trust",
            "commodity index",
            "natural resources",
        ],
    ),
    (
        "International",
        [
            "international equity",
            "emerging market",
            "developed market",
            "world ex-u.s",
            "ex us equity",
            "ftse developed",
            "msci eafe",
            "msci world",
            "msci emerg",
            "ftse emerg",
            "all world",
        ],
    ),
]


def _infer_etf_sector(name: str | None, category: str | None) -> str | None:
    """Infer a sector label for an ETF from yfinance category or long name."""
    if category:
        cat = category.lower()
        for sector, keyword in _ETF_CATEGORY_KEYWORDS:
            if keyword in cat:
                return sector
    if name:
        text = name.lower()
        for sector, keywords in _ETF_NAME_PATTERNS:
            if any(kw in text for kw in keywords):
                return sector
    return None


class MarketDataClient:
    """Thin wrapper around yfinance for fetching market data.

    All yfinance calls are routed through this class so they can be
    easily patched in tests.
    """

    def fetch_price_history(
        self,
        ticker: str,
        start: date,
        end: date,
    ) -> PriceHistory:
        """Fetch OHLCV price history for a ticker between start and end dates.

        Args:
            ticker: The ticker symbol (e.g. "AAPL").
            start: Inclusive start date.
            end: Inclusive end date.

        Returns:
            A PriceHistory containing one PriceBar per trading day.
        """
        df = yf.Ticker(ticker).history(start=start, end=end)
        bars: list[PriceBar] = []
        for idx, row in df.iterrows():
            bar_date = idx.date() if hasattr(idx, "date") else idx
            bars.append(
                PriceBar(
                    date=bar_date,
                    open=float(row["Open"]),
                    high=float(row["High"]),
                    low=float(row["Low"]),
                    close=float(row["Close"]),
                    volume=int(row["Volume"]),
                )
            )
        return PriceHistory(
            ticker=ticker,
            bars=bars,
            start_date=start,
            end_date=end,
        )

    def fetch_ticker_info(self, ticker: str) -> TickerInfo:
        """Fetch current quote and fundamentals for a ticker.

        Args:
            ticker: The ticker symbol (e.g. "AAPL").

        Returns:
            A TickerInfo with fields populated where available.
        """
        info: dict[str, Any] = yf.Ticker(ticker).info
        sector = info.get("sector") or _infer_etf_sector(
            info.get("longName"), info.get("category")
        )
        return TickerInfo(
            ticker=ticker,
            name=info.get("longName"),
            sector=sector,
            industry=info.get("industry"),
            market_cap=info.get("marketCap"),
            pe_ratio=info.get("trailingPE"),
            dividend_yield=info.get("dividendYield"),
            week_52_high=info.get("fiftyTwoWeekHigh"),
            week_52_low=info.get("fiftyTwoWeekLow"),
            current_price=(
                info.get("currentPrice")
                or info.get("regularMarketPrice")
                or info.get("navPrice")
                or info.get("previousClose")
            ),
            currency=info.get("currency"),
            exchange=info.get("exchange"),
            description=info.get("longBusinessSummary"),
        )

    def search_tickers(self, query: str) -> list[dict[str, str]]:
        """Search for tickers by name or symbol.

        Args:
            query: A free-text search string (e.g. "Apple").

        Returns:
            A list of dicts with "symbol" and "name" keys.  Returns an
            empty list if the yfinance Search API is unavailable.
        """
        try:
            quotes = yf.Search(query).quotes
        except AttributeError:
            return []
        results: list[dict[str, str]] = []
        for quote in quotes:
            symbol = quote.get("symbol", "")
            name = quote.get("longname") or quote.get("shortname") or ""
            results.append({"symbol": symbol, "name": name})
        return results


market_client = MarketDataClient()
