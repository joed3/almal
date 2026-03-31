"""Unit tests for PortfolioAnalyzer with synthetic data (no network calls)."""

from datetime import date, timedelta

import pandas as pd
import pytest
from src.analysis.performance import PortfolioAnalyzer
from src.models.market import PriceBar, PriceHistory
from src.models.portfolio import Holding, Lot

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_holding(ticker: str, shares: float) -> Holding:
    """Return a Holding with a single lot."""
    return Holding(ticker=ticker, lots=[Lot(ticker=ticker, shares=shares)])


def _make_price_history(
    ticker: str, prices: list[float], start: date | None = None
) -> PriceHistory:
    """Return a PriceHistory from a list of closing prices."""
    if start is None:
        start = date(2023, 1, 1)
    bars = []
    for i, price in enumerate(prices):
        bar_date = start + timedelta(days=i)
        bars.append(
            PriceBar(
                date=bar_date,
                open=price,
                high=price,
                low=price,
                close=price,
                volume=1000,
            )
        )
    return PriceHistory(
        ticker=ticker,
        bars=bars,
        start_date=bars[0].date,
        end_date=bars[-1].date,
    )


def _make_series(prices: list[float], start: date | None = None) -> pd.Series:
    """Return a pd.Series with DatetimeIndex from a list of prices."""
    if start is None:
        start = date(2023, 1, 1)
    dates = [start + timedelta(days=i) for i in range(len(prices))]
    return pd.Series(
        [float(p) for p in prices],
        index=pd.DatetimeIndex(dates),
    )


# ---------------------------------------------------------------------------
# compute_portfolio_series
# ---------------------------------------------------------------------------


def test_compute_portfolio_series_normalises_to_one() -> None:
    """portfolio_series starts at exactly 1.0."""
    analyzer = PortfolioAnalyzer()
    holdings = [_make_holding("AAPL", 10.0), _make_holding("MSFT", 5.0)]
    price_histories = {
        "AAPL": _make_price_history("AAPL", [100.0, 110.0, 120.0]),
        "MSFT": _make_price_history("MSFT", [200.0, 210.0, 220.0]),
    }

    series = analyzer.compute_portfolio_series(holdings, price_histories)

    assert not series.empty
    assert series.iloc[0] == pytest.approx(1.0)


def test_compute_portfolio_series_correct_values() -> None:
    """portfolio_series reflects weighted sum of holdings."""
    analyzer = PortfolioAnalyzer()
    # 1 share of stock at 100, 200, 300
    holdings = [_make_holding("XYZ", 1.0)]
    price_histories = {
        "XYZ": _make_price_history("XYZ", [100.0, 200.0, 300.0]),
    }

    series = analyzer.compute_portfolio_series(holdings, price_histories)

    assert series.iloc[0] == pytest.approx(1.0)
    assert series.iloc[1] == pytest.approx(2.0)
    assert series.iloc[2] == pytest.approx(3.0)


# ---------------------------------------------------------------------------
# compute_metrics
# ---------------------------------------------------------------------------


def test_compute_metrics_total_return() -> None:
    """total_return is (last / first) - 1."""
    analyzer = PortfolioAnalyzer()
    # Start at 1.0, end at 1.5 → total_return = 0.5
    portfolio_series = _make_series([1.0, 1.1, 1.25, 1.5])
    benchmark_series = _make_series([1.0, 1.05, 1.1, 1.15])

    metrics = analyzer.compute_metrics(portfolio_series, benchmark_series)

    assert metrics.total_return == pytest.approx(0.5)


def test_compute_metrics_max_drawdown() -> None:
    """max_drawdown captures the worst peak-to-trough decline."""
    analyzer = PortfolioAnalyzer()
    # Peak at 2.0, then drops to 1.0 → drawdown = -0.5
    portfolio_series = _make_series([1.0, 2.0, 1.0, 1.5])
    benchmark_series = _make_series([1.0, 1.1, 1.0, 1.1])

    metrics = analyzer.compute_metrics(portfolio_series, benchmark_series)

    assert metrics.max_drawdown == pytest.approx(-0.5)


def test_compute_metrics_no_benchmark_fields() -> None:
    """PerformanceMetrics does not expose benchmark_total_return fields."""
    analyzer = PortfolioAnalyzer()
    portfolio_series = _make_series([1.0, 1.1, 1.2])
    benchmark_series = _make_series([1.0, 1.0, 1.3])

    metrics = analyzer.compute_metrics(portfolio_series, benchmark_series)

    assert not hasattr(metrics, "benchmark_total_return")
    assert not hasattr(metrics, "benchmark_annualized_return")


# ---------------------------------------------------------------------------
# compute_benchmark_result
# ---------------------------------------------------------------------------


def test_compute_benchmark_result_total_return() -> None:
    """BenchmarkResult.total_return matches the series end/start ratio."""
    analyzer = PortfolioAnalyzer()
    series = _make_series([1.0, 1.0, 1.3])

    result = analyzer.compute_benchmark_result("SPY", series)

    assert result.ticker == "SPY"
    assert result.total_return == pytest.approx(0.3)
    assert len(result.series) == 3


def test_compute_benchmark_result_series_keys_are_iso_dates() -> None:
    """BenchmarkResult.series keys are ISO date strings."""
    analyzer = PortfolioAnalyzer()
    series = _make_series([1.0, 1.05, 1.1])

    result = analyzer.compute_benchmark_result("QQQ", series)

    for key in result.series:
        # Must be a valid ISO date: YYYY-MM-DD
        assert len(key) == 10
        assert key[4] == "-"
        assert key[7] == "-"


# ---------------------------------------------------------------------------
# compute_holding_weights
# ---------------------------------------------------------------------------


def test_compute_holding_weights_sum_to_one() -> None:
    """Holding weights sum to exactly 1.0."""
    analyzer = PortfolioAnalyzer()
    holdings = [
        _make_holding("AAPL", 10.0),
        _make_holding("MSFT", 5.0),
        _make_holding("GOOG", 2.0),
    ]
    latest_prices = {"AAPL": 150.0, "MSFT": 300.0, "GOOG": 100.0}

    weights = analyzer.compute_holding_weights(holdings, latest_prices)

    assert weights  # non-empty
    total_weight = sum(w.weight for w in weights)
    assert total_weight == pytest.approx(1.0)


def test_compute_holding_weights_correct_proportion() -> None:
    """A single holding gets weight = 1.0."""
    analyzer = PortfolioAnalyzer()
    holdings = [_make_holding("AAPL", 10.0)]
    latest_prices = {"AAPL": 150.0}

    weights = analyzer.compute_holding_weights(holdings, latest_prices)

    assert len(weights) == 1
    assert weights[0].weight == pytest.approx(1.0)
    assert weights[0].market_value == pytest.approx(1500.0)


def test_compute_holding_weights_skips_missing_prices() -> None:
    """Holdings without a price entry are excluded from output."""
    analyzer = PortfolioAnalyzer()
    holdings = [
        _make_holding("AAPL", 10.0),
        _make_holding("UNKN", 5.0),
    ]
    latest_prices = {"AAPL": 150.0}

    weights = analyzer.compute_holding_weights(holdings, latest_prices)

    tickers = [w.ticker for w in weights]
    assert "AAPL" in tickers
    assert "UNKN" not in tickers
