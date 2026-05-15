"""Tests for market data API routes with mocked MarketDataClient."""

from datetime import date
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from src.models.market import PriceBar, PriceHistory, TickerInfo

_TICKER_INFO = TickerInfo(
    ticker="AAPL",
    name="Apple Inc.",
    sector="Technology",
    current_price=185.0,
    currency="USD",
)

_PRICE_HISTORY = PriceHistory(
    ticker="AAPL",
    bars=[
        PriceBar(
            date=date(2024, 1, 2),
            open=185.0,
            high=188.0,
            low=184.0,
            close=187.0,
            volume=50_000_000,
        )
    ],
    start_date=date(2024, 1, 1),
    end_date=date(2024, 1, 31),
)


@pytest.fixture(autouse=True)
def mock_market_client():
    """Patch market_client for every test in this module."""
    with patch("src.api.routes.market.market_client") as mock:
        mock.fetch_ticker_info.return_value = _TICKER_INFO
        mock.fetch_price_history.return_value = _PRICE_HISTORY
        mock.search_tickers.return_value = [
            {"symbol": "AAPL", "name": "Apple Inc."},
            {"symbol": "AAPX", "name": "Apple X Corp"},
        ]
        yield mock


async def test_get_ticker_info_returns_200(client: AsyncClient) -> None:
    response = await client.get("/market/ticker/AAPL")
    assert response.status_code == 200
    data = response.json()
    assert data["ticker"] == "AAPL"
    assert data["name"] == "Apple Inc."
    assert data["current_price"] == 185.0


async def test_get_ticker_info_shape(client: AsyncClient) -> None:
    response = await client.get("/market/ticker/AAPL")
    data = response.json()
    assert "ticker" in data
    assert "name" in data
    assert "sector" in data
    assert "current_price" in data


async def test_get_price_history_returns_200(client: AsyncClient) -> None:
    response = await client.get(
        "/market/ticker/AAPL/history",
        params={"start": "2024-01-01", "end": "2024-01-31"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ticker"] == "AAPL"
    assert "bars" in data
    assert len(data["bars"]) == 1


async def test_get_price_history_bar_fields(client: AsyncClient) -> None:
    response = await client.get(
        "/market/ticker/AAPL/history",
        params={"start": "2024-01-01", "end": "2024-01-31"},
    )
    bar = response.json()["bars"][0]
    assert "date" in bar
    assert "open" in bar
    assert "high" in bar
    assert "low" in bar
    assert "close" in bar
    assert "volume" in bar


async def test_get_price_history_default_params(client: AsyncClient) -> None:
    """History endpoint works without explicit start/end params."""
    response = await client.get("/market/ticker/AAPL/history")
    assert response.status_code == 200


async def test_search_tickers_returns_200(client: AsyncClient) -> None:
    response = await client.get("/market/search", params={"q": "apple"})
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2


async def test_search_tickers_shape(client: AsyncClient) -> None:
    response = await client.get("/market/search", params={"q": "apple"})
    item = response.json()[0]
    assert "symbol" in item
    assert "name" in item


# ---------------------------------------------------------------------------
# /market/suggest — portfolio_ticker_metrics
# ---------------------------------------------------------------------------


def _make_multi_bar_history(
    ticker: str, n: int = 30, start_price: float = 100.0
) -> "PriceHistory":
    from datetime import timedelta

    start = date(2024, 1, 2)
    bars = [
        PriceBar(
            date=start + timedelta(days=i),
            open=start_price,
            high=start_price * 1.01,
            low=start_price * 0.99,
            close=start_price * (1 + i * 0.001),
            volume=1_000_000,
        )
        for i in range(n)
    ]
    return PriceHistory(
        ticker=ticker,
        bars=bars,
        start_date=bars[0].date,
        end_date=bars[-1].date,
    )


async def test_suggest_returns_portfolio_ticker_metrics(client: AsyncClient) -> None:
    """suggest endpoint includes portfolio_ticker_metrics for each holding."""
    aapl_hist = _make_multi_bar_history("AAPL", n=30, start_price=185.0)
    tlt_hist = _make_multi_bar_history("TLT", n=30, start_price=90.0)

    def _hist(ticker: str, *_args, **_kwargs) -> PriceHistory:
        return {"AAPL": aapl_hist, "TLT": tlt_hist}.get(ticker, aapl_hist)

    with patch("src.api.routes.market.market_client") as mock:
        mock.fetch_price_history.side_effect = _hist
        mock.fetch_ticker_info.return_value = _TICKER_INFO

        response = await client.post(
            "/market/suggest",
            json={
                "holdings": [
                    {"ticker": "AAPL", "lots": [{"ticker": "AAPL", "shares": 10}]}
                ],
                "candidates": ["TLT"],
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "portfolio_ticker_metrics" in data
    ptm = data["portfolio_ticker_metrics"]
    assert ptm is not None
    assert "AAPL" in ptm
    m = ptm["AAPL"]
    assert "volatility" in m
    assert "sharpe_ratio" in m
    assert "total_return" in m


async def test_suggest_returns_suggestions_sorted_by_correlation(
    client: AsyncClient,
) -> None:
    """suggest returns candidates sorted correlation ascending."""
    aapl_hist = _make_multi_bar_history("AAPL", n=30, start_price=185.0)
    tlt_hist = _make_multi_bar_history("TLT", n=30, start_price=90.0)
    gld_hist = _make_multi_bar_history("GLD", n=30, start_price=180.0)

    def _hist(ticker: str, *_args, **_kwargs) -> PriceHistory:
        return {"AAPL": aapl_hist, "TLT": tlt_hist, "GLD": gld_hist}.get(
            ticker, aapl_hist
        )

    with patch("src.api.routes.market.market_client") as mock:
        mock.fetch_price_history.side_effect = _hist
        mock.fetch_ticker_info.return_value = _TICKER_INFO

        response = await client.post(
            "/market/suggest",
            json={
                "holdings": [
                    {"ticker": "AAPL", "lots": [{"ticker": "AAPL", "shares": 10}]}
                ],
                "candidates": ["TLT", "GLD"],
            },
        )

    assert response.status_code == 200
    suggestions = response.json()["suggestions"]
    correlations = [s["correlation"] for s in suggestions]
    assert correlations == sorted(correlations)
