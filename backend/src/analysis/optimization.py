import logging
from datetime import date, timedelta

import pandas as pd
from pypfopt import expected_returns, objective_functions, risk_models
from pypfopt.discrete_allocation import DiscreteAllocation
from pypfopt.efficient_frontier import EfficientFrontier

from src.data.market import market_client
from src.models.optimizer import (
    AllocationRequirement,
    EfficientFrontierPoint,
    OptimizationMetrics,
    OptimizationStrategy,
    OptimizeResult,
)

logger = logging.getLogger(__name__)


class PortfolioOptimizer:
    """Wrapper around PyPortfolioOpt for portfolio optimization calculations."""

    def __init__(self, risk_free_rate: float = 0.02) -> None:
        """Initialise the optimizer.

        Args:
            risk_free_rate: The annual risk-free rate used for Sharpe ratio calculation.
        """
        self.risk_free_rate = risk_free_rate

    def optimize(
        self,
        tickers: list[str],
        new_cash: float,
        current_portfolio: dict[str, float],
        strategy: OptimizationStrategy,
        lookback_days: int = 365 * 3,
    ) -> OptimizeResult:
        """Run the optimization pipeline for the given candidate universe.

        Args:
            tickers: List of ticker symbols to consider.
            new_cash: New capital to add to the total optimization pool.
            current_portfolio: Map of ticker to current absolute share counts.
            strategy: The optimization objective function.
            lookback_days: How many days of historical data to use for stats.

        Returns:
            An OptimizeResult structured payload.
        """
        # 1. Fetch historical price data
        end_date = date.today()
        start_date = end_date - timedelta(days=lookback_days)

        price_series = {}
        latest_prices = {}
        for ticker in tickers:
            try:
                history = market_client.fetch_price_history(
                    ticker, start_date, end_date
                )
                if not history.bars:
                    continue
                closes = [bar.close for bar in history.bars]
                dates = [pd.to_datetime(bar.date) for bar in history.bars]
                price_series[ticker] = pd.Series(closes, index=dates)
                latest_prices[ticker] = closes[-1]
            except Exception as e:
                logger.warning(f"Failed to fetch data for {ticker}: {e}")

        if not price_series:
            raise ValueError("Failed to fetch historical data for all candidates.")

        df = pd.DataFrame(price_series).dropna(how="all").ffill(limit=5).dropna()
        if df.empty:
            raise ValueError("Cleaned price dataframe is empty.")

        # 2. Calculate expected returns and sample covariance
        mu = expected_returns.mean_historical_return(df)
        S = risk_models.sample_cov(df)

        # 3. Optimize
        ef = EfficientFrontier(mu, S)

        if strategy == OptimizationStrategy.MIN_VOLATILITY:
            ef.min_volatility()
        elif strategy == OptimizationStrategy.MAX_SHARPE:
            ef.max_sharpe(risk_free_rate=self.risk_free_rate)
        elif strategy == OptimizationStrategy.MAX_RETURN:
            # We must specify a target risk or just maximise return
            # (which puts 100% in the single best asset). Without a target risk,
            # max_return is trivial but we provide an L2 regularization or just a
            # simple max return objective. PyPortfolioOpt efficient_return requires
            # a target return. To just maximise return, we can just do max return by
            # finding the asset with max mu and assigning weight 1.
            # But more robustly, we use max_sharpe with high regularization.
            # Let's just create a frontier and pick the highest return point.
            ef.efficient_return(
                target_return=mu.max() * 0.99
            )  # slightly below max to leave room for optimizer tolerance
        elif strategy == OptimizationStrategy.REGULARIZED_SHARPE:
            ef.add_objective(objective_functions.L2_reg, gamma=0.1)
            ef.max_sharpe(risk_free_rate=self.risk_free_rate)
        else:
            raise ValueError(f"Unknown strategy: {strategy}")

        cleaned_weights = ef.clean_weights(cutoff=0.01)  # Trim weights < 1%

        # 4. Performance metrics
        ret, vol, sharpe = ef.portfolio_performance(risk_free_rate=self.risk_free_rate)

        # 5. Discrete Allocation
        current_value = sum(
            current_portfolio.get(t, 0.0) * latest_prices.get(t, 0.0) for t in tickers
        )
        total_value = current_value + new_cash

        # If total value is 0 or less, fallback to skip allocation
        if total_value <= 0:
            return OptimizeResult(
                strategy=strategy,
                allocations=[],
                metrics=OptimizationMetrics(
                    expected_annual_return=ret,
                    annual_volatility=vol,
                    sharpe_ratio=sharpe,
                ),
                frontier_curve=self._generate_frontier_curve(mu, S),
                leftover_cash=0.0,
            )

        da = DiscreteAllocation(
            cleaned_weights, pd.Series(latest_prices), total_portfolio_value=total_value
        )
        try:
            alloc_result, leftover = da.lp_portfolio()
        except Exception:
            # Fallback to greedy if LP fails
            alloc_result, leftover = da.greedy_portfolio()

        allocations = []
        for ticker in tickers:
            target_shares = alloc_result.get(ticker, 0)
            current_shares = current_portfolio.get(ticker, 0.0)
            weight = cleaned_weights.get(ticker, 0.0)

            # Record it if we own it or are buying it
            if target_shares > 0 or current_shares > 0:
                dollar_alloc = target_shares * latest_prices.get(ticker, 0.0)
                allocations.append(
                    AllocationRequirement(
                        ticker=ticker,
                        weight=weight,
                        current_shares=current_shares,
                        target_shares=target_shares,
                        shares_delta=target_shares - current_shares,
                        target_dollars=dollar_alloc,
                    )
                )

        allocations.sort(key=lambda x: x.weight, reverse=True)

        # 6. Generate Efficient Frontier Curve
        curve_points = self._generate_frontier_curve(mu, S)

        metrics = OptimizationMetrics(
            expected_annual_return=ret,
            annual_volatility=vol,
            sharpe_ratio=sharpe,
        )

        return OptimizeResult(
            strategy=strategy,
            allocations=allocations,
            metrics=metrics,
            frontier_curve=curve_points,
            leftover_cash=leftover,
        )

    def _generate_frontier_curve(
        self, mu: pd.Series, S: pd.DataFrame, num_points: int = 50
    ) -> list[EfficientFrontierPoint]:
        """Sweep across target ranges to generate the efficient frontier curve."""
        curve_points = []
        min_ret = mu.min()
        max_ret = mu.max()

        # Determine the lowest viable risk portfolio
        ef_min_vol = EfficientFrontier(mu, S)
        ef_min_vol.min_volatility()
        min_ret_from_min_vol, vol_from_min_vol, _ = ef_min_vol.portfolio_performance()

        # If min return is lower than min_vol return, we start from min_vol return
        start_ret = max(min_ret, min_ret_from_min_vol)

        # Create a range of target returns slightly inside bounds
        # to avoid optimizer crashes
        target_returns = [
            start_ret + (m / max(num_points - 1, 1)) * (max_ret - start_ret)
            for m in range(num_points)
        ]

        # Trim edge values slightly to avoid solver errors
        if len(target_returns) > 2:
            target_returns[0] = (
                target_returns[0] * 1.001
                if target_returns[0] > 0
                else target_returns[0] * 0.999
            )
            target_returns[-1] = (
                target_returns[-1] * 0.999
                if target_returns[-1] > 0
                else target_returns[-1] * 1.001
            )

        for target in target_returns:
            try:
                ef = EfficientFrontier(mu, S)
                ef.add_objective(objective_functions.L2_reg, gamma=0.1)
                ef.efficient_return(target_return=target)
                r, v, _ = ef.portfolio_performance(risk_free_rate=self.risk_free_rate)
                curve_points.append(
                    EfficientFrontierPoint(
                        volatility=v,
                        weights=dict(ef.clean_weights(cutoff=0.01)),
                        **{"return": r},
                    )
                )
            except Exception as e:
                logger.debug(
                    f"Failed to calculate frontier point for target {target}: {e}"
                )

        # If generation failed, fallback to returning the endpoints to guarantee a line.
        if len(curve_points) < 2:
            return [
                EfficientFrontierPoint(
                    volatility=vol_from_min_vol,
                    weights={},
                    **{"return": min_ret_from_min_vol},
                ),
                EfficientFrontierPoint(
                    volatility=S.max().max() ** 0.5, weights={}, **{"return": mu.max()}
                ),
            ]

        return curve_points
