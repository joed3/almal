"""Research agent for the Almal multi-agent system.

This agent is responsible for gathering market data, news, and fundamental
information about securities in the portfolio using external data sources.
"""

from datetime import date, timedelta

import pandas as pd
from anthropic import AsyncAnthropic

from src.agents.base import BaseAgent
from src.agents.types import AgentIntent, AgentRequest, AgentResponse
from src.analysis.performance import PortfolioAnalyzer, ProfileResult
from src.config.settings import get_settings
from src.data.market import market_client
from src.models.market import PriceHistory
from src.models.portfolio import Holding


class ResearchAgent(BaseAgent):
    """Fetches and summarises market data for a given ticker or portfolio."""

    def __init__(self) -> None:
        """Initialise the ResearchAgent."""
        super().__init__("research")
        settings = get_settings()
        self._anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def _execute(self, request: AgentRequest) -> AgentResponse:
        """Execute the research workflow.

        Handles PROFILE_PORTFOLIO intent only. INVESTIGATE_TICKER raises
        NotImplementedError (not yet implemented in this stage).

        Args:
            request: The structured request to process.

        Returns:
            An AgentResponse with a ProfileResult in result for
            PROFILE_PORTFOLIO intent.

        Raises:
            NotImplementedError: For INVESTIGATE_TICKER intent.
            ValueError: For unexpected intents.
        """
        if request.intent == AgentIntent.INVESTIGATE_TICKER:
            return await self._investigate_ticker(request)

        if request.intent != AgentIntent.PROFILE_PORTFOLIO:
            raise ValueError(f"Unsupported intent: {request.intent}")

        return await self._profile_portfolio(request)

    async def _investigate_ticker(self, request: AgentRequest) -> AgentResponse:
        """Run the single-ticker investigation workflow.

        Args:
            request: AgentRequest with INVESTIGATE_TICKER intent and payload
                containing ticker, and optionally start_date/end_date and holdings.

        Returns:
            AgentResponse with ticker stats, price history, and performance metrics.
        """
        payload = request.payload
        ticker = payload["ticker"]

        end_date = payload.get("end_date")
        end_date = date.fromisoformat(end_date) if end_date else date.today()

        start_date = payload.get("start_date")
        start_date = (
            date.fromisoformat(start_date)
            if start_date
            else end_date - timedelta(days=365)
        )

        try:
            info = market_client.fetch_ticker_info(ticker)
        except Exception as exc:
            return AgentResponse(
                intent=request.intent,
                success=False,
                result={},
                error=f"Failed to fetch ticker info for {ticker}: {exc}",
            )

        try:
            history = market_client.fetch_price_history(ticker, start_date, end_date)
        except Exception as exc:
            return AgentResponse(
                intent=request.intent,
                success=False,
                result={},
                error=f"Failed to fetch price history for {ticker}: {exc}",
            )

        analyzer = PortfolioAnalyzer()
        performance = analyzer.compute_ticker_metrics(history)

        result_data = {
            "info": info.model_dump(),
            "history": history.model_dump(),
            "performance": performance.model_dump(),
            "portfolio_fit": None,
        }

        # If holdings are provided, compute portfolio fit
        if "holdings" in payload and payload["holdings"]:
            holdings = [Holding.model_validate(h) for h in payload["holdings"]]

            # Fetch price histories for all holdings to build portfolio series
            holding_histories: dict[str, PriceHistory] = {}
            for h in holdings:
                try:
                    holding_histories[h.ticker] = market_client.fetch_price_history(
                        h.ticker, start_date, end_date
                    )
                except Exception as exc:
                    self.logger.warning(
                        "Failed to fetch history for holding %s: %s", h.ticker, exc
                    )

            portfolio_series = analyzer.compute_portfolio_series(
                holdings, holding_histories
            )

            if not portfolio_series.empty:
                result_data["portfolio_series"] = {
                    str(idx.date()): float(val) for idx, val in portfolio_series.items()
                }
                try:
                    fit_result = analyzer.compute_portfolio_fit(
                        candidate_ticker=ticker,
                        candidate_history=history,
                        portfolio_series=portfolio_series,
                    )
                    result_data["portfolio_fit"] = fit_result.model_dump()
                except Exception as exc:
                    self.logger.warning("Failed to compute portfolio fit: %s", exc)

        return AgentResponse(
            intent=request.intent,
            success=True,
            result=result_data,
        )

    async def _profile_portfolio(self, request: AgentRequest) -> AgentResponse:
        """Run the portfolio profiling workflow.

        Args:
            request: AgentRequest with PROFILE_PORTFOLIO intent and payload
                containing holdings, benchmarks, start_date, and end_date.

        Returns:
            AgentResponse with a serialised ProfileResult in result.
        """
        payload = request.payload
        holdings = [Holding.model_validate(h) for h in payload["holdings"]]
        benchmarks: list[str] = payload["benchmarks"]
        start_date = date.fromisoformat(payload["start_date"])
        end_date = date.fromisoformat(payload["end_date"])

        # Fetch price histories for each holding + all benchmarks.
        all_tickers = [h.ticker for h in holdings] + benchmarks
        price_histories: dict[str, PriceHistory] = {}
        for ticker in all_tickers:
            try:
                history = market_client.fetch_price_history(
                    ticker, start_date, end_date
                )
                price_histories[ticker] = history
            except Exception as exc:  # noqa: BLE001
                self.logger.warning(
                    "Failed to fetch price history for %s: %s", ticker, exc
                )

        # Fetch latest prices for weight computation, also capture sector/name.
        latest_prices: dict[str, float] = {}
        sector_map: dict[str, str | None] = {}
        name_map: dict[str, str | None] = {}
        for holding in holdings:
            try:
                info = market_client.fetch_ticker_info(holding.ticker)
                if info.current_price is not None:
                    latest_prices[holding.ticker] = info.current_price
                sector_map[holding.ticker] = info.sector
                name_map[holding.ticker] = info.name
            except Exception as exc:  # noqa: BLE001
                self.logger.warning(
                    "Failed to fetch ticker info for %s: %s",
                    holding.ticker,
                    exc,
                )

        # Filter holdings to those with available price histories.
        available_holdings = [h for h in holdings if h.ticker in price_histories]
        holding_histories = {
            ticker: hist
            for ticker, hist in price_histories.items()
            if ticker not in benchmarks
        }

        analyzer = PortfolioAnalyzer()
        portfolio_series = analyzer.compute_portfolio_series(
            available_holdings, holding_histories
        )

        if portfolio_series.empty:
            return AgentResponse(
                intent=request.intent,
                success=False,
                result={},
                error="No valid portfolio price data for the given period",
            )

        # Build a normalised pd.Series for each benchmark.
        benchmark_series_map: dict[str, pd.Series] = {}
        for bm_ticker in benchmarks:
            bm_history = price_histories.get(bm_ticker)
            if bm_history is None or bm_history.bars == []:
                self.logger.warning(
                    "No price data available for benchmark %s", bm_ticker
                )
                continue
            bm_dates = [bar.date for bar in bm_history.bars]
            bm_closes = [bar.close for bar in bm_history.bars]
            bm_raw = pd.Series(
                bm_closes,
                index=pd.DatetimeIndex(bm_dates),
            )
            bm_raw = bm_raw.ffill(limit=5).dropna()
            if bm_raw.empty or bm_raw.iloc[0] == 0:
                self.logger.warning("Benchmark %s has empty price data", bm_ticker)
                continue
            benchmark_series_map[bm_ticker] = bm_raw / bm_raw.iloc[0]

        if not benchmark_series_map:
            return AgentResponse(
                intent=request.intent,
                success=False,
                result={},
                error="No valid price data for any of the requested benchmarks",
            )

        metrics = analyzer.compute_metrics(portfolio_series)

        benchmark_results = [
            analyzer.compute_benchmark_result(ticker, series, portfolio_series)
            for ticker, series in benchmark_series_map.items()
        ]

        weights = analyzer.compute_holding_weights(
            holdings, latest_prices, sector_map=sector_map, name_map=name_map
        )

        corr_matrix = analyzer.compute_correlation_matrix(
            [h.ticker for h in available_holdings], holding_histories
        )

        ticker_metrics = {
            ticker: analyzer.compute_ticker_metrics(history)
            for ticker, history in holding_histories.items()
        }

        profile = ProfileResult(
            metrics=metrics,
            benchmarks=benchmark_results,
            weights=weights,
            portfolio_series={
                str(idx.date()): float(val) for idx, val in portfolio_series.items()
            },
            correlation_matrix=corr_matrix or None,
            ticker_metrics=ticker_metrics or None,
        )

        return AgentResponse(
            intent=request.intent,
            success=True,
            result=profile.model_dump(),
        )
