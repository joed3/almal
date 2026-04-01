import logging
from datetime import date, timedelta
from math import sqrt
from typing import Literal

import numpy as np
import pandas as pd
from pypfopt import expected_returns, objective_functions, risk_models
from pypfopt.black_litterman import (
    BlackLittermanModel,
    market_implied_prior_returns,
    market_implied_risk_aversion,
)
from pypfopt.discrete_allocation import DiscreteAllocation
from pypfopt.efficient_frontier import EfficientFrontier
from skfolio.cluster import HierarchicalClustering
from skfolio.cluster import LinkageMethod as SkfolioLinkageMethod
from skfolio.optimization import HierarchicalRiskParity, RiskBudgeting
from skfolio.optimization import MeanRisk as SkfolioMeanRisk
from skfolio.optimization import ObjectiveFunction as SkfolioObjectiveFunction

from src.config.settings import get_settings
from src.data.market import market_client
from src.models.optimizer import (
    AdvancedParams,
    AllocationRequirement,
    BacktestResult,
    BacktestStats,
    BLView,
    ConstraintSet,
    EfficientFrontierPoint,
    LotData,
    OptimizationMetrics,
    OptimizationStrategy,
    OptimizeResult,
)

logger = logging.getLogger(__name__)

# Confidence level -> Idzorek percentage uncertainty mapping
_BL_CONFIDENCE_MAP = {"low": 0.25, "medium": 0.50, "high": 0.90}


def _apply_weight_bounds(
    ef: EfficientFrontier,
    tickers: list[str],
    weight_bounds: dict[str, tuple[float, float]] | None,
) -> None:
    """Inject per-ticker weight bound constraints into an EfficientFrontier object."""
    if not weight_bounds:
        return
    for ticker, (lo, hi) in weight_bounds.items():
        if ticker not in tickers:
            continue
        i = tickers.index(ticker)
        if lo > 0:
            ef.add_constraint(lambda w, idx=i, lb=lo: w[idx] >= lb)
        if hi < 1.0:
            ef.add_constraint(lambda w, idx=i, ub=hi: w[idx] <= ub)


class PortfolioOptimizer:
    """Wrapper around PyPortfolioOpt and skfolio for portfolio optimization."""

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
        views: list[BLView] | None = None,
        advanced_params: AdvancedParams | None = None,
        constraints: ConstraintSet | None = None,
        lots: list[LotData] | None = None,
    ) -> OptimizeResult:
        """Run the optimization pipeline for the given candidate universe.

        Args:
            tickers: List of ticker symbols to consider.
            new_cash: New capital to add to the total optimization pool.
            current_portfolio: Map of ticker to current absolute share counts.
            strategy: The optimization objective function.
            lookback_days: How many days of historical data to use for stats.
            views: Optional Black-Litterman views (only used for BL strategy).
            advanced_params: Optional advanced parameter overrides.

        Returns:
            An OptimizeResult structured payload.
        """
        rfr = (
            advanced_params.risk_free_rate
            if advanced_params and advanced_params.risk_free_rate is not None
            else self.risk_free_rate
        )

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

        # 2. Compute portfolio value (apply reduction target if any)
        current_value = sum(
            current_portfolio.get(t, 0.0) * latest_prices.get(t, 0.0) for t in tickers
        )
        total_value = current_value + new_cash
        if constraints and constraints.portfolio_reduction_target:
            total_value = max(0.0, total_value - constraints.portfolio_reduction_target)

        # 3. Build per-ticker weight bounds from constraints
        weight_bounds: dict[str, tuple[float, float]] = {}
        if constraints and total_value > 0:
            for ticker in df.columns:
                lo = constraints.min_weights.get(ticker, 0.0)
                hi = constraints.max_weights.get(ticker, 1.0)
                if ticker in constraints.min_shares:
                    price = latest_prices.get(ticker, 0.0)
                    if price > 0:
                        lo = max(
                            lo, constraints.min_shares[ticker] * price / total_value
                        )
                weight_bounds[ticker] = (lo, min(hi, 1.0))

        # 4. Compute tax-aware mu adjustment (MV strategies only)
        mu_override: pd.Series | None = None
        lots_by_ticker: dict[str, list[LotData]] = {}
        if lots:
            for lot in lots:
                lots_by_ticker.setdefault(lot.ticker, []).append(lot)

        if constraints and constraints.tax_aware and lots_by_ticker:
            settings = get_settings()
            st_rate = settings.short_term_tax_rate
            lt_rate = settings.long_term_tax_rate
            today = date.today()
            mu_base = expected_returns.mean_historical_return(df)
            mu_override = mu_base.copy()
            for ticker in df.columns:
                ticker_lots = lots_by_ticker.get(ticker, [])
                price = latest_prices.get(ticker, 0.0)
                if not ticker_lots or price <= 0:
                    continue
                total_tax = 0.0
                total_shares_lotted = sum(lot.shares for lot in ticker_lots)
                for lot in ticker_lots:
                    if lot.cost_basis is None or lot.purchase_date is None:
                        continue
                    gain = price - lot.cost_basis
                    if gain <= 0:
                        continue
                    days = (today - lot.purchase_date).days
                    rate = st_rate if days <= 365 else lt_rate
                    total_tax += lot.shares * gain * rate
                position_value = total_shares_lotted * price
                if position_value > 0 and ticker in mu_override.index:
                    drag = (total_tax / position_value) * constraints.tax_aware_weight
                    mu_override[ticker] -= drag

        # 5. Route to the appropriate optimizer
        cleaned_weights, metrics, curve_points = self._compute_optimal_weights(
            df,
            strategy,
            rfr,
            advanced_params,
            views or [],
            weight_bounds=weight_bounds or None,
            mu_override=mu_override,
        )

        if total_value <= 0:
            return OptimizeResult(
                strategy=strategy,
                allocations=[],
                metrics=metrics,
                frontier_curve=curve_points,
                leftover_cash=0.0,
            )

        # 6. Discrete Allocation
        da = DiscreteAllocation(
            cleaned_weights,
            pd.Series(latest_prices),
            total_portfolio_value=total_value,
        )
        try:
            alloc_result, leftover = da.lp_portfolio()
        except Exception:
            alloc_result, leftover = da.greedy_portfolio()

        # 7. Build allocations with tax impact and holding days
        today = date.today()
        settings = get_settings()
        st_rate = settings.short_term_tax_rate
        lt_rate = settings.long_term_tax_rate

        allocations = []
        for ticker in tickers:
            target_shares = alloc_result.get(ticker, 0)
            current_shares = current_portfolio.get(ticker, 0.0)
            weight = cleaned_weights.get(ticker, 0.0)

            if target_shares > 0 or current_shares > 0:
                dollar_alloc = target_shares * latest_prices.get(ticker, 0.0)
                price = latest_prices.get(ticker, 0.0)
                delta = target_shares - current_shares

                # Estimate capital gains tax on shares being sold (FIFO)
                est_tax: float | None = None
                if delta < 0 and price > 0 and lots_by_ticker.get(ticker):
                    shares_to_sell = abs(delta)
                    sorted_lots = sorted(
                        lots_by_ticker[ticker],
                        key=lambda lot: lot.purchase_date or date.min,
                    )
                    remaining = shares_to_sell
                    running_tax = 0.0
                    for lot in sorted_lots:
                        if remaining <= 0:
                            break
                        sold = min(lot.shares, remaining)
                        if lot.cost_basis is not None:
                            gain = max(0.0, price - lot.cost_basis)
                            days = (
                                (today - lot.purchase_date).days
                                if lot.purchase_date
                                else 366
                            )
                            rate = st_rate if days <= 365 else lt_rate
                            running_tax += sold * gain * rate
                        remaining -= sold
                    if running_tax > 0:
                        est_tax = round(running_tax, 2)

                # Holding days: use oldest lot with a known purchase_date
                holding_days: int | None = None
                ticker_lots = lots_by_ticker.get(ticker, [])
                dated_lots = [
                    lot for lot in ticker_lots if lot.purchase_date is not None
                ]
                if dated_lots:
                    oldest = min(dated_lots, key=lambda lot: lot.purchase_date)  # type: ignore[arg-type, return-value]
                    holding_days = (today - oldest.purchase_date).days  # type: ignore[operator]

                allocations.append(
                    AllocationRequirement(
                        ticker=ticker,
                        weight=weight,
                        current_shares=current_shares,
                        target_shares=target_shares,
                        shares_delta=delta,
                        target_dollars=dollar_alloc,
                        est_tax_impact=est_tax,
                        holding_days=holding_days,
                    )
                )

        allocations.sort(key=lambda x: x.weight, reverse=True)

        return OptimizeResult(
            strategy=strategy,
            allocations=allocations,
            metrics=metrics,
            frontier_curve=curve_points,
            leftover_cash=leftover,
        )

    def _compute_optimal_weights(
        self,
        df: pd.DataFrame,
        strategy: OptimizationStrategy,
        rfr: float,
        advanced_params: AdvancedParams | None,
        views: list[BLView],
        weight_bounds: dict[str, tuple[float, float]] | None = None,
        mu_override: "pd.Series | None" = None,
    ) -> tuple[dict[str, float], OptimizationMetrics, list[EfficientFrontierPoint]]:
        """Compute mathematically optimal weights for a given DataFrame and strategy.

        Args:
            df: Price DataFrame (dates × tickers).
            strategy: Optimization objective.
            rfr: Risk-free rate.
            advanced_params: Optional strategy-specific parameter overrides.
            views: Black-Litterman views.
            weight_bounds: Per-ticker (min, max) weight bounds.
            mu_override: Pre-computed expected returns (used for tax-aware mode).
        """
        skfolio_strategies = {
            OptimizationStrategy.RISK_PARITY,
            OptimizationStrategy.HRP,
            OptimizationStrategy.CVAR,
        }

        if strategy in skfolio_strategies:
            cleaned_weights = self._optimize_skfolio(
                df, strategy, advanced_params, weight_bounds
            )
            ret_series = df.pct_change().dropna()
            w_arr = np.array([cleaned_weights.get(t, 0.0) for t in df.columns])
            port_ret = ret_series.values @ w_arr
            ann_ret = float((1 + port_ret.mean()) ** 252 - 1)
            ann_vol = float(port_ret.std() * sqrt(252))
            sharpe = (ann_ret - rfr) / ann_vol if ann_vol > 0 else 0.0
            metrics = OptimizationMetrics(
                expected_annual_return=round(ann_ret, 4),
                annual_volatility=round(ann_vol, 4),
                sharpe_ratio=round(sharpe, 3),
            )
            curve_points: list[EfficientFrontierPoint] = []

        elif strategy == OptimizationStrategy.BLACK_LITTERMAN:
            mu_bl, S = self._compute_bl_expected_returns(df, views, advanced_params)
            ef = EfficientFrontier(mu_bl, S)
            _apply_weight_bounds(ef, df.columns.tolist(), weight_bounds)
            ef.max_sharpe(risk_free_rate=rfr)
            cleaned_weights = ef.clean_weights(cutoff=0.01)
            ret, vol, sharpe = ef.portfolio_performance(risk_free_rate=rfr)
            metrics = OptimizationMetrics(
                expected_annual_return=ret,
                annual_volatility=vol,
                sharpe_ratio=sharpe,
            )
            curve_points = self._generate_frontier_curve(mu_bl, S)

        else:
            mu = (
                mu_override
                if mu_override is not None
                else expected_returns.mean_historical_return(df)
            )
            S = risk_models.sample_cov(df)
            ef = EfficientFrontier(mu, S)
            _apply_weight_bounds(ef, df.columns.tolist(), weight_bounds)

            if strategy == OptimizationStrategy.MIN_VOLATILITY:
                ef.min_volatility()
            elif strategy == OptimizationStrategy.MAX_SHARPE:
                ef.max_sharpe(risk_free_rate=rfr)
            elif strategy == OptimizationStrategy.MAX_RETURN:
                ef.efficient_return(target_return=mu.max() * 0.99)
            elif strategy == OptimizationStrategy.REGULARIZED_SHARPE:
                ef.add_objective(objective_functions.L2_reg, gamma=0.1)
                ef.max_sharpe(risk_free_rate=rfr)
            else:
                raise ValueError(f"Unknown strategy: {strategy}")

            cleaned_weights = ef.clean_weights(cutoff=0.01)
            ret, vol, sharpe = ef.portfolio_performance(risk_free_rate=rfr)
            metrics = OptimizationMetrics(
                expected_annual_return=ret,
                annual_volatility=vol,
                sharpe_ratio=sharpe,
            )
            mu_for_frontier = (
                expected_returns.mean_historical_return(df)
                if mu_override is not None
                else mu
            )
            curve_points = self._generate_frontier_curve(mu_for_frontier, S)

        return cleaned_weights, metrics, curve_points

    def _optimize_skfolio(
        self,
        df: pd.DataFrame,
        strategy: OptimizationStrategy,
        advanced_params: AdvancedParams | None,
        weight_bounds: dict[str, tuple[float, float]] | None = None,
    ) -> dict[str, float]:
        """Run a skfolio-based optimization and return a cleaned weight dict.

        Args:
            df: Price DataFrame (dates x tickers).
            strategy: One of RISK_PARITY, HRP, or CVAR.
            advanced_params: Optional parameter overrides.

        Returns:
            Dict mapping ticker -> weight (values sum to ~1).
        """
        X = df.pct_change().dropna().to_numpy()
        tickers = list(df.columns)

        if strategy == OptimizationStrategy.RISK_PARITY:
            model: RiskBudgeting | HierarchicalRiskParity | SkfolioMeanRisk = (
                RiskBudgeting()
            )
        elif strategy == OptimizationStrategy.HRP:
            linkage_str = (
                advanced_params.hrp_linkage
                if advanced_params and advanced_params.hrp_linkage
                else "ward"
            )
            try:
                linkage_method = SkfolioLinkageMethod(linkage_str.lower())
            except ValueError:
                linkage_method = SkfolioLinkageMethod.WARD
            model = HierarchicalRiskParity(
                hierarchical_clustering_estimator=HierarchicalClustering(
                    linkage_method=linkage_method
                )
            )
        else:  # CVAR
            beta = (
                advanced_params.cvar_beta
                if advanced_params and advanced_params.cvar_beta is not None
                else 0.95
            )
            model = SkfolioMeanRisk(
                objective_function=SkfolioObjectiveFunction.MINIMIZE_RISK,
                cvar_beta=beta,
                min_weights=0.0,
            )

        model.fit(X)
        raw_weights: dict[str, float] = {}
        for ticker, w in zip(tickers, model.weights_):
            if float(w) > 0.005:  # trim near-zero weights
                raw_weights[ticker] = float(w)

        # Apply weight bounds via clip + renormalise
        if weight_bounds:
            for ticker in list(raw_weights.keys()):
                lo, hi = weight_bounds.get(ticker, (0.0, 1.0))
                raw_weights[ticker] = max(lo, min(hi, raw_weights[ticker]))
            # Honour min weights for tickers not yet in the result
            for ticker, (lo, _) in weight_bounds.items():
                if lo > 0 and ticker in tickers and ticker not in raw_weights:
                    raw_weights[ticker] = lo

        total = sum(raw_weights.values())
        return {t: w / total for t, w in raw_weights.items()} if total > 0 else {}

    def _compute_bl_expected_returns(
        self,
        df: pd.DataFrame,
        views: list[BLView],
        advanced_params: AdvancedParams | None,
    ) -> tuple[pd.Series, pd.DataFrame]:
        """Compute Black-Litterman adjusted expected returns.

        Uses market-implied equilibrium returns derived from a market proxy,
        then incorporates any user-supplied views.

        Args:
            df: Price DataFrame (dates x tickers).
            views: List of user views (may be empty).
            advanced_params: Optional overrides for tau and market proxy.

        Returns:
            Tuple of (bl_mu, covariance_matrix).
        """
        end_date = date.today()
        start_date = end_date - timedelta(days=365 * 3)
        proxy = (
            advanced_params.bl_market_proxy
            if advanced_params and advanced_params.bl_market_proxy
            else "SPY"
        )
        tau = (
            advanced_params.bl_tau
            if advanced_params and advanced_params.bl_tau is not None
            else 0.05
        )

        # Fetch market proxy for delta estimation
        market_prices: pd.Series | None = None
        try:
            history = market_client.fetch_price_history(proxy, start_date, end_date)
            if history.bars:
                closes = [bar.close for bar in history.bars]
                dates_idx = [pd.to_datetime(bar.date) for bar in history.bars]
                market_prices = pd.Series(closes, index=dates_idx)
        except Exception as e:
            logger.warning(f"BL: failed to fetch market proxy {proxy}: {e}")

        S = risk_models.sample_cov(df)

        if market_prices is not None and len(market_prices) > 10:
            delta = market_implied_risk_aversion(market_prices)
        else:
            delta = 2.5  # fallback delta

        # Use equal weights as the market portfolio proxy
        n = len(df.columns)
        mkt_weights = pd.Series({t: 1.0 / n for t in df.columns})
        pi = market_implied_prior_returns(mkt_weights, delta, S)

        tickers = list(df.columns)
        valid_views = [v for v in views if v.ticker in tickers]

        if valid_views:
            # Use absolute_views dict + view_confidences for Idzorek omega scaling
            abs_views = {v.ticker: v.expected_return for v in valid_views}
            confidences = [
                _BL_CONFIDENCE_MAP.get(v.confidence, 0.5) for v in valid_views
            ]
            bl = BlackLittermanModel(
                S,
                pi=pi,
                absolute_views=abs_views,
                view_confidences=confidences,
                tau=tau,
            )
            mu_bl = bl.bl_returns()
        else:
            # No views: posterior == prior; return market-implied returns directly
            mu_bl = pi

        return mu_bl, S

    def run_backtest(
        self,
        tickers: list[str],
        strategy: OptimizationStrategy,
        cadence: Literal["monthly", "quarterly", "annual", "buy_and_hold"],
        benchmark: str = "SPY",
        lookback_years: int = 3,
        advanced_params: AdvancedParams | None = None,
        views: list[BLView] | None = None,
    ) -> BacktestResult:
        """Run a walk-forward optimization backtest over historical data."""
        rfr = (
            advanced_params.risk_free_rate
            if advanced_params and advanced_params.risk_free_rate is not None
            else self.risk_free_rate
        )
        views = views or []

        end_date = date.today()
        test_start = pd.to_datetime(end_date - timedelta(days=lookback_years * 365 + 5))
        # Training buffer matches the simulation window so _get_w sees the same depth
        data_start = test_start - pd.Timedelta(days=lookback_years * 365)

        all_symbols = list(set(tickers + [benchmark]))

        price_series: dict[str, pd.Series] = {}
        for symbol in all_symbols:
            try:
                history = market_client.fetch_price_history(
                    symbol, data_start.date(), end_date
                )
                if history.bars:
                    closes = [bar.close for bar in history.bars]
                    dates_idx = [pd.to_datetime(bar.date) for bar in history.bars]
                    price_series[symbol] = pd.Series(closes, index=dates_idx)
            except Exception as e:
                logger.warning(f"Backtest: failed to fetch {symbol}: {e}")

        available = [t for t in tickers if t in price_series]
        if not available or benchmark not in price_series:
            raise ValueError("Could not fetch sufficient price data for backtest.")

        df = (
            pd.DataFrame({t: price_series[t] for t in available})
            .dropna(how="all")
            .ffill(limit=5)
            .dropna()
        )
        bench_series = price_series[benchmark].reindex(df.index).ffill()

        df_test = df.loc[test_start:]
        bench_test = bench_series.loc[test_start:]

        if len(df_test) < 20:
            raise ValueError("Insufficient overlapping price data for backtest.")

        daily_rets = df.pct_change().dropna()
        bench_rets = bench_test.pct_change().dropna()

        # Align lengths exactly
        df_rets_test = daily_rets.loc[bench_rets.index]

        # Determine rebalance dates based on cadence inside df_test
        if cadence == "monthly":
            group = [df_test.index.year, df_test.index.month]
        elif cadence == "quarterly":
            group = [df_test.index.year, df_test.index.quarter]
        elif cadence == "annual":
            group = [df_test.index.year]
        else:
            group = None

        if group:
            rebalance_dates = (
                df_test.groupby(group).apply(lambda x: x.index[-1]).tolist()
            )
        else:
            rebalance_dates = []

        # Identify the trading day strictly prior to `first_day` to prevent same-day
        # data leakage
        first_day = df_test.index[0]
        prev_dates = df.index[df.index < first_day]
        if len(prev_dates) == 0:
            raise ValueError("No prior data available to compute initial weights.")
        prev_day = prev_dates[-1]

        # Remove the very last day if it accidentally snuck in, we can't project past it
        if len(rebalance_dates) > 0 and rebalance_dates[-1] == df_test.index[-1]:
            rebalance_dates.pop()

        def _get_w(T: pd.Timestamp) -> dict[str, float]:
            try:
                df_est = df.loc[T - pd.Timedelta(days=lookback_years * 365) : T]
                if len(df_est) < 20:
                    raise Exception("Not enough data in estimation window")
                w, _, _ = self._compute_optimal_weights(
                    df_est, strategy, rfr, advanced_params, views
                )
                # Filter out near zero
                w = {t: val for t, val in w.items() if val > 0.001}
                total = sum(w.values())
                return (
                    {t: val / total for t, val in w.items()}
                    if total > 0
                    else {t: 1.0 / len(available) for t in available}
                )
            except Exception:
                n = len(available)
                return {t: 1.0 / n for t in available}

        # Walk-forward backtest loop
        port_ret_wf = pd.Series(0.0, index=df_rets_test.index)
        current_w = _get_w(prev_day)

        rebalance_date_strs: list[str] = []
        reb_set = set(rebalance_dates)

        for d in df_rets_test.index:
            port_ret_wf[d] = sum(
                df_rets_test[t][d] * current_w.get(t, 0) for t in available
            )
            if d in reb_set:
                current_w = _get_w(d)
                rebalance_date_strs.append(str(d.date()))

        port_cum = (1 + port_ret_wf).cumprod()
        bench_cum = (1 + bench_rets).cumprod()

        dates_list = [str(d.date()) for d in port_cum.index]

        def _compute_stats(daily: pd.Series, cum: pd.Series) -> BacktestStats:
            n = len(daily)
            if n == 0 or cum.empty:
                return BacktestStats(
                    total_return=0,
                    annualized_return=0,
                    annual_volatility=0,
                    sharpe_ratio=0,
                    max_drawdown=0,
                    calmar_ratio=0,
                )
            total_ret = float(cum.iloc[-1] - 1)
            ann_ret = float((1 + total_ret) ** (252 / n) - 1)
            ann_vol = float(daily.std() * sqrt(252))
            sharpe = (ann_ret - self.risk_free_rate) / ann_vol if ann_vol > 0 else 0.0
            running_max = cum.cummax()
            drawdowns = (cum - running_max) / running_max
            max_dd = float(drawdowns.min()) if not drawdowns.empty else 0.0
            calmar = ann_ret / abs(max_dd) if max_dd != 0 else 0.0
            return BacktestStats(
                total_return=round(total_ret, 4),
                annualized_return=round(ann_ret, 4),
                annual_volatility=round(ann_vol, 4),
                sharpe_ratio=round(sharpe, 3),
                max_drawdown=round(max_dd, 4),
                calmar_ratio=round(calmar, 3),
            )

        port_stats = _compute_stats(port_ret_wf, port_cum)
        bench_stats = _compute_stats(bench_rets, bench_cum)

        # Buy-and-hold comparison: optimize once at the start and never rebalance.
        # Skip for buy_and_hold cadence since it would be identical to walk-forward.
        bah_cumulative: list[float] | None = None
        bah_stats: BacktestStats | None = None
        if cadence != "buy_and_hold":
            w_bnh = _get_w(prev_day)
            port_ret_bnh: pd.Series = sum(
                df_rets_test[t] * w_bnh.get(t, 0) for t in available
            )
            bnh_cum = (1 + port_ret_bnh).cumprod()
            bah_cumulative = [round(float(v), 4) for v in bnh_cum.to_numpy()]
            bah_stats = _compute_stats(port_ret_bnh, bnh_cum)

        return BacktestResult(
            dates=dates_list,
            portfolio_cumulative=[round(float(v), 4) for v in port_cum.to_numpy()],
            benchmark_cumulative=[round(float(v), 4) for v in bench_cum.to_numpy()],
            benchmark=benchmark,
            lookback_years=lookback_years,
            rebalance_dates=rebalance_date_strs,
            rebalance_cadence=cadence,
            strategy_used=strategy,
            stats=port_stats,
            benchmark_stats=bench_stats,
            bah_cumulative=bah_cumulative,
            bah_stats=bah_stats,
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

        start_ret = max(min_ret, min_ret_from_min_vol)

        target_returns = [
            start_ret + (m / max(num_points - 1, 1)) * (max_ret - start_ret)
            for m in range(num_points)
        ]

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
