"""Portfolio performance analytics.

Provides models and a PortfolioAnalyzer class for computing metrics,
portfolio series, and holding weights from raw price data.
"""

from math import sqrt

import pandas as pd
from pydantic import BaseModel

from src.models.market import PriceHistory
from src.models.portfolio import Holding


class PerformanceMetrics(BaseModel):
    """Computed performance statistics for a portfolio.

    Attributes:
        total_return: Cumulative return, e.g. 0.23 = 23%.
        annualized_return: CAGR over the observed period.
        volatility: Annualised standard deviation of daily returns.
        sharpe_ratio: Risk-adjusted return above the risk-free rate.
        max_drawdown: Worst peak-to-trough drawdown, e.g. -0.15 = -15%.
        alpha: Excess return vs CAPM prediction.
        beta: Sensitivity to benchmark movements.
        benchmark_total_return: Benchmark cumulative return.
        benchmark_annualized_return: Benchmark CAGR.
    """

    total_return: float
    annualized_return: float
    volatility: float
    sharpe_ratio: float
    max_drawdown: float
    alpha: float
    beta: float
    benchmark_total_return: float
    benchmark_annualized_return: float


class HoldingWeight(BaseModel):
    """Current market-value weight of a single holding.

    Attributes:
        ticker: The ticker symbol.
        market_value: Current market value (shares × price).
        weight: Fraction of total portfolio value, 0.0–1.0.
    """

    ticker: str
    market_value: float
    weight: float


class ProfileResult(BaseModel):
    """Full portfolio profile output.

    Attributes:
        metrics: Computed performance statistics.
        weights: Per-holding market-value weights.
        portfolio_series: ISO date → normalised portfolio value.
        benchmark_series: ISO date → normalised benchmark value.
        narrative: Optional natural-language critique from the Review Agent.
    """

    metrics: PerformanceMetrics
    weights: list[HoldingWeight]
    portfolio_series: dict[str, float]
    benchmark_series: dict[str, float]
    narrative: str | None = None


class PortfolioAnalyzer:
    """Computes portfolio analytics from price data and holdings."""

    def compute_portfolio_series(
        self,
        holdings: list[Holding],
        price_histories: dict[str, PriceHistory],
    ) -> pd.Series:
        """Return a daily portfolio value series normalised to 1.0 at start.

        Only includes dates where ALL tickers have a price. Missing values are
        forward-filled up to 5 days before dropping.

        Args:
            holdings: List of Holding objects with total_shares populated.
            price_histories: Map of ticker → PriceHistory.

        Returns:
            A pd.Series with a DatetimeIndex and float values starting at 1.0.
        """
        price_frames: dict[str, pd.Series] = {}
        for holding in holdings:
            ticker = holding.ticker
            if ticker not in price_histories:
                continue
            history = price_histories[ticker]
            if not history.bars:
                continue
            dates = [bar.date for bar in history.bars]
            closes = [bar.close for bar in history.bars]
            s = pd.Series(closes, index=pd.DatetimeIndex(dates), name=ticker)
            price_frames[ticker] = s

        if not price_frames:
            return pd.Series(dtype=float)

        df = pd.DataFrame(price_frames)
        df = df.ffill(limit=5)
        df = df.dropna()

        # Multiply each column by the holding's total_shares.
        shares_map = {h.ticker: h.total_shares for h in holdings}
        for ticker in df.columns:
            df[ticker] = df[ticker] * shares_map.get(ticker, 0.0)

        portfolio_values = df.sum(axis=1)
        if portfolio_values.empty or portfolio_values.iloc[0] == 0:
            return pd.Series(dtype=float)

        return portfolio_values / portfolio_values.iloc[0]

    def compute_metrics(
        self,
        portfolio_series: pd.Series,
        benchmark_series: pd.Series,
        risk_free_rate: float = 0.04,
    ) -> PerformanceMetrics:
        """Compute performance metrics for a portfolio vs a benchmark.

        Args:
            portfolio_series: Normalised daily portfolio value series.
            benchmark_series: Normalised daily benchmark value series.
            risk_free_rate: Annualised risk-free rate, default 4%.

        Returns:
            PerformanceMetrics with all fields populated.
        """
        total_return = float(portfolio_series.iloc[-1] / portfolio_series.iloc[0]) - 1.0
        n_days = len(portfolio_series)
        annualized_return = float((1 + total_return) ** (252 / n_days)) - 1.0

        daily_returns = portfolio_series.pct_change().dropna()
        volatility = float(daily_returns.std() * sqrt(252))

        sharpe_ratio = (
            (annualized_return - risk_free_rate) / volatility if volatility > 0 else 0.0
        )

        rolling_max = portfolio_series.cummax()
        drawdown = portfolio_series / rolling_max - 1.0
        max_drawdown = float(drawdown.min())

        benchmark_total_return = (
            float(benchmark_series.iloc[-1] / benchmark_series.iloc[0]) - 1.0
        )
        n_bench = len(benchmark_series)
        benchmark_annualized_return = (
            float((1 + benchmark_total_return) ** (252 / n_bench)) - 1.0
        )

        benchmark_returns = benchmark_series.pct_change().dropna()

        # Align both return series on common dates.
        aligned_port, aligned_bench = daily_returns.align(
            benchmark_returns, join="inner"
        )

        if len(aligned_bench) > 1 and aligned_bench.var() > 0:
            beta = float(aligned_port.cov(aligned_bench) / aligned_bench.var())
        else:
            beta = 1.0

        alpha = annualized_return - (
            risk_free_rate + beta * (benchmark_annualized_return - risk_free_rate)
        )

        return PerformanceMetrics(
            total_return=total_return,
            annualized_return=annualized_return,
            volatility=volatility,
            sharpe_ratio=sharpe_ratio,
            max_drawdown=max_drawdown,
            alpha=alpha,
            beta=beta,
            benchmark_total_return=benchmark_total_return,
            benchmark_annualized_return=benchmark_annualized_return,
        )

    def compute_holding_weights(
        self,
        holdings: list[Holding],
        latest_prices: dict[str, float],
    ) -> list[HoldingWeight]:
        """Compute current market-value weight for each holding.

        Holdings whose ticker has no available price are skipped.

        Args:
            holdings: List of Holding objects with total_shares populated.
            latest_prices: Map of ticker → current price.

        Returns:
            List of HoldingWeight objects, sorted descending by weight.
        """
        weighted: list[tuple[str, float]] = []
        for holding in holdings:
            price = latest_prices.get(holding.ticker)
            if price is None:
                continue
            market_value = holding.total_shares * price
            weighted.append((holding.ticker, market_value))

        total_value = sum(mv for _, mv in weighted)
        if total_value == 0:
            return []

        return [
            HoldingWeight(
                ticker=ticker,
                market_value=market_value,
                weight=market_value / total_value,
            )
            for ticker, market_value in sorted(
                weighted, key=lambda x: x[1], reverse=True
            )
        ]
