"""Research agent for the Almal multi-agent system.

This agent is responsible for gathering market data, news, and fundamental
information about securities in the portfolio using external data sources.
"""

from datetime import date

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
            raise NotImplementedError

        if request.intent != AgentIntent.PROFILE_PORTFOLIO:
            raise ValueError(f"Unsupported intent: {request.intent}")

        return await self._profile_portfolio(request)

    async def _profile_portfolio(self, request: AgentRequest) -> AgentResponse:
        """Run the portfolio profiling workflow.

        Args:
            request: AgentRequest with PROFILE_PORTFOLIO intent and payload
                containing holdings, benchmark, start_date, and end_date.

        Returns:
            AgentResponse with a serialised ProfileResult in result.
        """
        payload = request.payload
        holdings = [Holding.model_validate(h) for h in payload["holdings"]]
        benchmark: str = payload["benchmark"]
        start_date = date.fromisoformat(payload["start_date"])
        end_date = date.fromisoformat(payload["end_date"])

        # Fetch price histories for each holding + benchmark.
        all_tickers = [h.ticker for h in holdings] + [benchmark]
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

        # Fetch latest prices for weight computation.
        latest_prices: dict[str, float] = {}
        for holding in holdings:
            try:
                info = market_client.fetch_ticker_info(holding.ticker)
                if info.current_price is not None:
                    latest_prices[holding.ticker] = info.current_price
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
            if ticker != benchmark
        }

        analyzer = PortfolioAnalyzer()
        portfolio_series = analyzer.compute_portfolio_series(
            available_holdings, holding_histories
        )

        benchmark_history = price_histories.get(benchmark)
        if benchmark_history is None or benchmark_history.bars == []:
            return AgentResponse(
                intent=request.intent,
                success=False,
                result={},
                error=f"No price data available for benchmark {benchmark}",
            )

        import pandas as pd

        bench_dates = [bar.date for bar in benchmark_history.bars]
        bench_closes = [bar.close for bar in benchmark_history.bars]
        benchmark_series_raw = pd.Series(
            bench_closes,
            index=pd.DatetimeIndex(bench_dates),
        )
        benchmark_series_raw = benchmark_series_raw.ffill(limit=5).dropna()
        if benchmark_series_raw.empty or benchmark_series_raw.iloc[0] == 0:
            return AgentResponse(
                intent=request.intent,
                success=False,
                result={},
                error=f"Benchmark {benchmark} has empty price data",
            )
        benchmark_series = benchmark_series_raw / benchmark_series_raw.iloc[0]

        if portfolio_series.empty:
            return AgentResponse(
                intent=request.intent,
                success=False,
                result={},
                error="No valid portfolio price data for the given period",
            )

        metrics = analyzer.compute_metrics(portfolio_series, benchmark_series)
        weights = analyzer.compute_holding_weights(holdings, latest_prices)

        profile = ProfileResult(
            metrics=metrics,
            weights=weights,
            portfolio_series={
                str(idx.date()): float(val) for idx, val in portfolio_series.items()
            },
            benchmark_series={
                str(idx.date()): float(val) for idx, val in benchmark_series.items()
            },
        )

        return AgentResponse(
            intent=request.intent,
            success=True,
            result=profile.model_dump(),
        )
