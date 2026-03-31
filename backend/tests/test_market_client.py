"""Tests for MarketDataClient with mocked yfinance."""

from datetime import date
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
from src.data.market import MarketDataClient
from src.models.market import PriceHistory, TickerInfo


@pytest.fixture()
def client() -> MarketDataClient:
    """Return a fresh MarketDataClient instance."""
    return MarketDataClient()


def _make_mock_df() -> pd.DataFrame:
    """Build a minimal OHLCV DataFrame similar to yfinance output."""
    index = pd.to_datetime(["2024-01-02", "2024-01-03"])
    data = {
        "Open": [185.0, 186.0],
        "High": [188.0, 189.0],
        "Low": [184.0, 185.0],
        "Close": [187.0, 188.0],
        "Volume": [50_000_000, 55_000_000],
    }
    return pd.DataFrame(data, index=index)


class TestFetchPriceHistory:
    """Tests for MarketDataClient.fetch_price_history."""

    def test_returns_price_history_shape(self, client: MarketDataClient) -> None:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = _make_mock_df()

        with patch("src.data.market.yf.Ticker", return_value=mock_ticker):
            result = client.fetch_price_history(
                "AAPL", date(2024, 1, 2), date(2024, 1, 3)
            )

        assert isinstance(result, PriceHistory)
        assert result.ticker == "AAPL"
        assert result.start_date == date(2024, 1, 2)
        assert result.end_date == date(2024, 1, 3)
        assert len(result.bars) == 2

    def test_bar_fields_mapped_correctly(self, client: MarketDataClient) -> None:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = _make_mock_df()

        with patch("src.data.market.yf.Ticker", return_value=mock_ticker):
            result = client.fetch_price_history(
                "AAPL", date(2024, 1, 2), date(2024, 1, 3)
            )

        bar = result.bars[0]
        assert bar.open == 185.0
        assert bar.high == 188.0
        assert bar.low == 184.0
        assert bar.close == 187.0
        assert bar.volume == 50_000_000

    def test_empty_dataframe_returns_empty_bars(self, client: MarketDataClient) -> None:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame(
            columns=["Open", "High", "Low", "Close", "Volume"]
        )

        with patch("src.data.market.yf.Ticker", return_value=mock_ticker):
            result = client.fetch_price_history(
                "AAPL", date(2024, 1, 2), date(2024, 1, 2)
            )

        assert result.bars == []

    def test_yfinance_ticker_called_with_symbol(self, client: MarketDataClient) -> None:
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = _make_mock_df()

        with patch("src.data.market.yf.Ticker", return_value=mock_ticker) as mock_cls:
            client.fetch_price_history("TSLA", date(2024, 1, 2), date(2024, 1, 3))
            mock_cls.assert_called_once_with("TSLA")


class TestFetchTickerInfo:
    """Tests for MarketDataClient.fetch_ticker_info."""

    _FULL_INFO: dict = {
        "longName": "Apple Inc.",
        "sector": "Technology",
        "industry": "Consumer Electronics",
        "marketCap": 3_000_000_000_000,
        "trailingPE": 28.5,
        "dividendYield": 0.005,
        "fiftyTwoWeekHigh": 199.0,
        "fiftyTwoWeekLow": 124.0,
        "currentPrice": 185.0,
        "currency": "USD",
        "exchange": "NMS",
        "longBusinessSummary": "Apple Inc. designs consumer electronics.",
    }

    def test_maps_all_fields_correctly(self, client: MarketDataClient) -> None:
        mock_ticker = MagicMock()
        mock_ticker.info = self._FULL_INFO

        with patch("src.data.market.yf.Ticker", return_value=mock_ticker):
            result = client.fetch_ticker_info("AAPL")

        assert isinstance(result, TickerInfo)
        assert result.ticker == "AAPL"
        assert result.name == "Apple Inc."
        assert result.sector == "Technology"
        assert result.industry == "Consumer Electronics"
        assert result.market_cap == 3_000_000_000_000
        assert result.pe_ratio == 28.5
        assert result.dividend_yield == 0.005
        assert result.week_52_high == 199.0
        assert result.week_52_low == 124.0
        assert result.current_price == 185.0
        assert result.currency == "USD"
        assert result.exchange == "NMS"
        assert result.description == "Apple Inc. designs consumer electronics."

    def test_missing_fields_produce_none(self, client: MarketDataClient) -> None:
        mock_ticker = MagicMock()
        mock_ticker.info = {}

        with patch("src.data.market.yf.Ticker", return_value=mock_ticker):
            result = client.fetch_ticker_info("AAPL")

        assert result.name is None
        assert result.sector is None
        assert result.market_cap is None
        assert result.current_price is None

    def test_partial_info_dict(self, client: MarketDataClient) -> None:
        mock_ticker = MagicMock()
        mock_ticker.info = {"longName": "Microsoft Corp", "sector": "Technology"}

        with patch("src.data.market.yf.Ticker", return_value=mock_ticker):
            result = client.fetch_ticker_info("MSFT")

        assert result.name == "Microsoft Corp"
        assert result.sector == "Technology"
        assert result.industry is None
        assert result.pe_ratio is None


class TestSearchTickers:
    """Tests for MarketDataClient.search_tickers."""

    def test_returns_symbol_and_name(self, client: MarketDataClient) -> None:
        mock_search = MagicMock()
        mock_search.quotes = [
            {"symbol": "AAPL", "longname": "Apple Inc."},
            {"symbol": "AAPX", "shortname": "Apple X"},
        ]

        with patch("src.data.market.yf.Search", return_value=mock_search):
            result = client.search_tickers("apple")

        assert result[0] == {"symbol": "AAPL", "name": "Apple Inc."}
        assert result[1] == {"symbol": "AAPX", "name": "Apple X"}

    def test_returns_empty_list_when_search_unavailable(
        self, client: MarketDataClient
    ) -> None:
        with patch("src.data.market.yf.Search", side_effect=AttributeError):
            result = client.search_tickers("apple")

        assert result == []

    def test_prefers_longname_over_shortname(self, client: MarketDataClient) -> None:
        mock_search = MagicMock()
        mock_search.quotes = [
            {
                "symbol": "AAPL",
                "longname": "Apple Inc.",
                "shortname": "Apple",
            }
        ]

        with patch("src.data.market.yf.Search", return_value=mock_search):
            result = client.search_tickers("apple")

        assert result[0]["name"] == "Apple Inc."
