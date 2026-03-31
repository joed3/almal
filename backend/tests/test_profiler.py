"""Integration tests for the portfolio profiler pipeline.

Uses mocked market_client and Anthropic to avoid network calls.
"""

from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from src.agents.research import ResearchAgent
from src.agents.review import ReviewAgent
from src.agents.types import AgentIntent, AgentRequest, AgentResponse
from src.api.main import app
from src.models.market import PriceBar, PriceHistory, TickerInfo
from src.models.portfolio import Holding, Lot, Portfolio

# ---------------------------------------------------------------------------
# Fixtures and helpers
# ---------------------------------------------------------------------------


def _make_holding(ticker: str, shares: float) -> Holding:
    return Holding(ticker=ticker, lots=[Lot(ticker=ticker, shares=shares)])


def _make_price_history(
    ticker: str, n_days: int = 30, start_price: float = 100.0
) -> PriceHistory:
    start = date(2023, 1, 1)
    bars = []
    for i in range(n_days):
        price = start_price * (1 + i * 0.001)
        bars.append(
            PriceBar(
                date=start + timedelta(days=i),
                open=price,
                high=price * 1.01,
                low=price * 0.99,
                close=price,
                volume=1_000_000,
            )
        )
    return PriceHistory(
        ticker=ticker,
        bars=bars,
        start_date=bars[0].date,
        end_date=bars[-1].date,
    )


def _make_ticker_info(ticker: str, price: float) -> TickerInfo:
    return TickerInfo(ticker=ticker, current_price=price)


def _build_profile_request(
    holdings: list[Holding] | None = None,
    benchmark: str = "SPY",
) -> AgentRequest:
    if holdings is None:
        holdings = [_make_holding("AAPL", 10.0), _make_holding("MSFT", 5.0)]
    return AgentRequest(
        intent=AgentIntent.PROFILE_PORTFOLIO,
        payload={
            "holdings": [h.model_dump() for h in holdings],
            "benchmark": benchmark,
            "start_date": "2023-01-01",
            "end_date": "2023-01-31",
        },
    )


# ---------------------------------------------------------------------------
# Research Agent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_research_agent_profile_portfolio() -> None:
    """ResearchAgent returns success=True with a ProfileResult in result."""
    holdings = [_make_holding("AAPL", 10.0), _make_holding("MSFT", 5.0)]
    request = _build_profile_request(holdings)

    aapl_history = _make_price_history("AAPL", n_days=20)
    msft_history = _make_price_history("MSFT", n_days=20, start_price=200.0)
    spy_history = _make_price_history("SPY", n_days=20, start_price=400.0)

    def fake_fetch_price_history(ticker: str, start: date, end: date) -> PriceHistory:
        return {
            "AAPL": aapl_history,
            "MSFT": msft_history,
            "SPY": spy_history,
        }[ticker]

    def fake_fetch_ticker_info(ticker: str) -> TickerInfo:
        prices = {"AAPL": 150.0, "MSFT": 250.0}
        return _make_ticker_info(ticker, prices.get(ticker, 100.0))

    with (
        patch(
            "src.agents.research.market_client.fetch_price_history",
            side_effect=fake_fetch_price_history,
        ),
        patch(
            "src.agents.research.market_client.fetch_ticker_info",
            side_effect=fake_fetch_ticker_info,
        ),
    ):
        agent = ResearchAgent()
        response = await agent.run(request)

    assert response.success is True
    assert response.intent == AgentIntent.PROFILE_PORTFOLIO
    result = response.result
    assert "metrics" in result
    assert "weights" in result
    assert "portfolio_series" in result
    assert "benchmark_series" in result
    metrics = result["metrics"]
    assert "total_return" in metrics
    assert "sharpe_ratio" in metrics


# ---------------------------------------------------------------------------
# Review Agent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_review_agent_generates_narrative() -> None:
    """ReviewAgent returns AgentResponse with a non-empty narrative."""
    profile_result = {
        "metrics": {
            "total_return": 0.15,
            "annualized_return": 0.18,
            "volatility": 0.20,
            "sharpe_ratio": 0.7,
            "max_drawdown": -0.08,
            "alpha": 0.02,
            "beta": 0.95,
            "benchmark_total_return": 0.10,
            "benchmark_annualized_return": 0.12,
        },
        "weights": [
            {"ticker": "AAPL", "market_value": 1500.0, "weight": 0.6},
            {"ticker": "MSFT", "market_value": 1000.0, "weight": 0.4},
        ],
        "portfolio_series": {"2023-01-01": 1.0, "2023-01-31": 1.15},
        "benchmark_series": {"2023-01-01": 1.0, "2023-01-31": 1.10},
    }

    request = AgentRequest(
        intent=AgentIntent.PROFILE_PORTFOLIO,
        payload={"profile_result": profile_result, "context": "portfolio"},
    )

    mock_content = MagicMock()
    mock_content.text = (
        "The portfolio returned 15% versus the benchmark's 10%, "
        "outperforming by 5 percentage points. AAPL represents 60% of the "
        "portfolio, posing significant concentration risk. Consider diversifying "
        "by reducing AAPL exposure and adding uncorrelated assets."
    )
    mock_message = MagicMock()
    mock_message.content = [mock_content]

    with patch("src.agents.review.AsyncAnthropic") as mock_cls:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_message)
        mock_cls.return_value = mock_client

        agent = ReviewAgent()
        response = await agent.run(request)

    assert response.success is True
    assert response.narrative is not None
    assert len(response.narrative) > 0


# ---------------------------------------------------------------------------
# POST /portfolio/analyze endpoint
# ---------------------------------------------------------------------------


@pytest.fixture
async def http_client() -> AsyncClient:
    """Async HTTP client bound to the FastAPI app."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest.mark.asyncio
async def test_analyze_endpoint(http_client: AsyncClient) -> None:
    """POST /portfolio/analyze returns 200 with expected shape."""
    import datetime

    portfolio = Portfolio(
        holdings=[
            _make_holding("AAPL", 10.0),
            _make_holding("MSFT", 5.0),
        ],
        uploaded_at=datetime.datetime(2023, 1, 1, 0, 0, 0),
    )

    success_response = AgentResponse(
        intent=AgentIntent.PROFILE_PORTFOLIO,
        success=True,
        result={
            "metrics": {
                "total_return": 0.10,
                "annualized_return": 0.12,
                "volatility": 0.18,
                "sharpe_ratio": 0.44,
                "max_drawdown": -0.05,
                "alpha": 0.01,
                "beta": 0.90,
                "benchmark_total_return": 0.08,
                "benchmark_annualized_return": 0.10,
            },
            "weights": [
                {"ticker": "AAPL", "market_value": 1500.0, "weight": 0.75},
                {"ticker": "MSFT", "market_value": 500.0, "weight": 0.25},
            ],
            "portfolio_series": {"2023-01-01": 1.0, "2023-01-31": 1.10},
            "benchmark_series": {"2023-01-01": 1.0, "2023-01-31": 1.08},
        },
        narrative="Good performance overall.",
    )

    with patch(
        "src.api.routes.portfolio._orchestrator.run",
        new_callable=AsyncMock,
        return_value=success_response,
    ):
        resp = await http_client.post(
            "/portfolio/analyze",
            json={
                "portfolio": portfolio.model_dump(mode="json"),
                "benchmark": "SPY",
                "start_date": "2023-01-01",
                "end_date": "2023-01-31",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["intent"] == "profile_portfolio"
    assert "result" in body
    assert body["narrative"] == "Good performance overall."
