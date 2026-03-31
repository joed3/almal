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
