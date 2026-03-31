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
    """

    total_return: float
    annualized_return: float
    volatility: float
    sharpe_ratio: float
    max_drawdown: float


class BenchmarkResult(BaseModel):
    """Metrics and normalised price series for a single benchmark.

    Alpha and beta here describe the *portfolio's* relationship to this
    benchmark, not the benchmark itself.

    Attributes:
        ticker: The benchmark ticker symbol.
        total_return: Benchmark cumulative return over the period.
        annualized_return: Benchmark CAGR over the observed period.
        volatility: Benchmark annualised volatility.
        sharpe_ratio: Benchmark Sharpe ratio.
        max_drawdown: Benchmark worst peak-to-trough drawdown.
        alpha: Portfolio excess return vs CAPM prediction using this benchmark.
        beta: Portfolio sensitivity to this benchmark's movements.
        series: ISO date → normalised value starting at 1.0.
    """

    ticker: str
    total_return: float
    annualized_return: float
    volatility: float
    sharpe_ratio: float
    max_drawdown: float
    alpha: float
    beta: float
    series: dict[str, float]


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
        benchmarks: One BenchmarkResult per benchmark requested.
        weights: Per-holding market-value weights.
        portfolio_series: ISO date → normalised portfolio value.
        narrative: Optional natural-language critique from the Review Agent.
    """

    metrics: PerformanceMetrics
    benchmarks: list[BenchmarkResult]
    weights: list[HoldingWeight]
    portfolio_series: dict[str, float]
    narrative: str | None = None


class TickerAnalysisResult(BaseModel):
    """Analysis of a single ticker.

    Attributes:
        performance: Computed performance statistics.
        narrative: Optional natural-language critique from the Review Agent.
    """

    performance: PerformanceMetrics
    narrative: str | None = None


class PortfolioFitResult(BaseModel):
    """Result of computing how a new ticker fits into an existing portfolio.

    Attributes:
        correlation: Correlation between the new ticker and the existing portfolio.
        current_metrics: Performance metrics of the existing portfolio.
        simulated_metrics: Performance metrics of the portfolio if a fixed weight
            (e.g., 5%) was allocated to the new ticker.
        narrative: Optional natural-language critique from the Review Agent.
    """

    correlation: float
    current_metrics: PerformanceMetrics
    simulated_metrics: PerformanceMetrics
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
        risk_free_rate: float = 0.04,
    ) -> PerformanceMetrics:
        """Compute portfolio-only performance metrics (no benchmark required).

        Alpha and beta are benchmark-relative and live on BenchmarkResult.

        Args:
            portfolio_series: Normalised daily portfolio value series.
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

        return PerformanceMetrics(
            total_return=total_return,
            annualized_return=annualized_return,
            volatility=volatility,
            sharpe_ratio=sharpe_ratio,
            max_drawdown=max_drawdown,
        )

    def compute_benchmark_result(
        self,
        ticker: str,
        benchmark_series: pd.Series,
        portfolio_series: pd.Series,
        risk_free_rate: float = 0.04,
    ) -> BenchmarkResult:
        """Compute full metrics for a benchmark and the portfolio's alpha/beta vs it.

        Args:
            ticker: The benchmark ticker symbol.
            benchmark_series: Normalised daily benchmark value series.
            portfolio_series: Normalised daily portfolio value series.
            risk_free_rate: Annualised risk-free rate, default 4%.

        Returns:
            BenchmarkResult with benchmark stats and portfolio alpha/beta.
        """
        total_return = float(benchmark_series.iloc[-1] / benchmark_series.iloc[0]) - 1.0
        n_days = len(benchmark_series)
        annualized_return = float((1 + total_return) ** (252 / n_days)) - 1.0

        bm_daily = benchmark_series.pct_change().dropna()
        volatility = float(bm_daily.std() * sqrt(252))
        sharpe_ratio = (
            (annualized_return - risk_free_rate) / volatility if volatility > 0 else 0.0
        )

        rolling_max = benchmark_series.cummax()
        max_drawdown = float((benchmark_series / rolling_max - 1.0).min())

        # Portfolio alpha/beta relative to this benchmark.
        port_daily = portfolio_series.pct_change().dropna()
        aligned_port, aligned_bench = port_daily.align(bm_daily, join="inner")
        if len(aligned_bench) > 1 and float(aligned_bench.var()) > 0:
            beta = float(aligned_port.cov(aligned_bench) / aligned_bench.var())
        else:
            beta = 1.0

        port_total = float(portfolio_series.iloc[-1] / portfolio_series.iloc[0]) - 1.0
        port_ann = float((1 + port_total) ** (252 / len(portfolio_series))) - 1.0
        alpha = port_ann - (
            risk_free_rate + beta * (annualized_return - risk_free_rate)
        )

        series = {str(idx.date()): float(val) for idx, val in benchmark_series.items()}
        return BenchmarkResult(
            ticker=ticker,
            total_return=total_return,
            annualized_return=annualized_return,
            volatility=volatility,
            sharpe_ratio=sharpe_ratio,
            max_drawdown=max_drawdown,
            alpha=alpha,
            beta=beta,
            series=series,
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

    def compute_ticker_metrics(
        self,
        history: PriceHistory,
        risk_free_rate: float = 0.04,
    ) -> PerformanceMetrics:
        """Compute performance metrics for a single ticker.

        Args:
            history: The price history for the ticker.
            risk_free_rate: Annualised risk-free rate, default 4%.

        Returns:
            PerformanceMetrics based on the closing price series.
        """
        if not history.bars:
            return PerformanceMetrics(
                total_return=0.0,
                annualized_return=0.0,
                volatility=0.0,
                sharpe_ratio=0.0,
                max_drawdown=0.0,
            )
        dates = [bar.date for bar in history.bars]
        closes = [bar.close for bar in history.bars]
        s = pd.Series(closes, index=pd.DatetimeIndex(dates))
        s = s.ffill(limit=5).dropna()

        if s.empty or s.iloc[0] == 0:
            return PerformanceMetrics(
                total_return=0.0,
                annualized_return=0.0,
                volatility=0.0,
                sharpe_ratio=0.0,
                max_drawdown=0.0,
            )

        s_norm = s / s.iloc[0]
        return self.compute_metrics(s_norm, risk_free_rate=risk_free_rate)

    def compute_portfolio_fit(
        self,
        candidate_ticker: str,
        candidate_history: PriceHistory,
        portfolio_series: pd.Series,
        risk_free_rate: float = 0.04,
        candidate_weight: float = 0.05,
    ) -> PortfolioFitResult:
        """Compute correlation and simulated impact of a new ticker.

        Simulates adding candidate_weight (e.g., 5%) of the new ticker
        by proportionally reducing the weights of existing holdings.

        Args:
            candidate_ticker: The ticker of the candidate asset.
            candidate_history: Price history of the candidate.
            portfolio_series: Normalised value series of the existing portfolio.
            risk_free_rate: Risk-free rate.
            candidate_weight: Weight to assign to the candidate.

        Returns:
            PortfolioFitResult containing correlation and metric impact.
        """
        dates = [bar.date for bar in candidate_history.bars]
        closes = [bar.close for bar in candidate_history.bars]
        cand_s = pd.Series(closes, index=pd.DatetimeIndex(dates), name=candidate_ticker)
        cand_s = cand_s.ffill(limit=5).dropna()

        if cand_s.empty or cand_s.iloc[0] == 0:
            raise ValueError("Candidate price history is empty or invalid")

        cand_norm = cand_s / cand_s.iloc[0]

        # Calculate correlation
        cand_daily = cand_norm.pct_change().dropna()
        port_daily = portfolio_series.pct_change().dropna()
        aligned_cand, aligned_port = cand_daily.align(port_daily, join="inner")

        if len(aligned_cand) > 1:
            correlation = float(aligned_cand.corr(aligned_port))
        else:
            correlation = 0.0

        current_metrics = self.compute_metrics(portfolio_series, risk_free_rate)

        # Calculate simulated portfolio series
        # Note: In a real rebalancing, we might rebalance daily/monthly.
        # Here we just linearly blend the normalised return streams.
        aligned_cand_norm, aligned_port_norm = cand_norm.align(
            portfolio_series, join="inner"
        )

        simulated_series = aligned_cand_norm * candidate_weight + aligned_port_norm * (
            1.0 - candidate_weight
        )
        simulated_series = simulated_series / simulated_series.iloc[0]

        simulated_metrics = self.compute_metrics(simulated_series, risk_free_rate)

        return PortfolioFitResult(
            correlation=correlation,
            current_metrics=current_metrics,
            simulated_metrics=simulated_metrics,
        )
