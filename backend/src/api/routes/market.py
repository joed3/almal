"""Market data API routes."""

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.agents.orchestrator import OrchestratorAgent
from src.agents.types import AgentIntent, AgentRequest, AgentResponse
from src.data.market import market_client
from src.models.market import PriceHistory, TickerInfo
from src.models.portfolio import Holding

router = APIRouter(prefix="/market", tags=["market"])

_orchestrator = OrchestratorAgent()


class PortfolioFitRequest(BaseModel):
    """Request body for the portfolio fit endpoint."""

    holdings: list[Holding]


@router.get("/ticker/{symbol}", response_model=TickerInfo)
async def get_ticker_info(symbol: str) -> TickerInfo:
    """Return current quote and fundamental data for a ticker symbol.

    Args:
        symbol: The ticker symbol (e.g. "AAPL").

    Returns:
        TickerInfo with fields populated where available.
    """
    try:
        return market_client.fetch_ticker_info(symbol)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/ticker/{symbol}/history", response_model=PriceHistory)
async def get_price_history(
    symbol: str,
    start: date = None,  # type: ignore[assignment]
    end: date = None,  # type: ignore[assignment]
) -> PriceHistory:
    """Return OHLCV price history for a ticker symbol.

    Args:
        symbol: The ticker symbol (e.g. "AAPL").
        start: Start date (defaults to one year ago).
        end: End date (defaults to today).

    Returns:
        PriceHistory with one PriceBar per trading day.
    """
    today = date.today()
    effective_end = end if end is not None else today
    effective_start = start if start is not None else today - timedelta(days=365)
    try:
        return market_client.fetch_price_history(symbol, effective_start, effective_end)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/search", response_model=list[dict[str, str]])
async def search_tickers(q: str) -> list[dict[str, str]]:
    """Search for tickers by name or symbol.

    Args:
        q: Free-text search string (e.g. "Apple").

    Returns:
        List of dicts with "symbol" and "name" keys.
    """
    try:
        return market_client.search_tickers(q)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/ticker/{symbol}/analysis", response_model=AgentResponse)
async def analyze_ticker(symbol: str) -> AgentResponse:
    """Analyze a single ticker symbol.

    Args:
        symbol: The ticker symbol (e.g. "AAPL").

    Returns:
        AgentResponse containing the ticker analysis and narrative.
    """
    request = AgentRequest(
        intent=AgentIntent.INVESTIGATE_TICKER,
        payload={"ticker": symbol},
    )
    response = await _orchestrator.run(request)
    if not response.success and response.error:
        raise HTTPException(status_code=500, detail=response.error)
    return response


@router.post("/ticker/{symbol}/fit", response_model=AgentResponse)
async def ticker_portfolio_fit(symbol: str, body: PortfolioFitRequest) -> AgentResponse:
    """Analyze a single ticker and its fit within an existing portfolio.

    Args:
        symbol: The ticker symbol.
        body: PortfolioFitRequest containing the current holdings.

    Returns:
        AgentResponse containing the analysis, fit metrics, and narrative.
    """
    request = AgentRequest(
        intent=AgentIntent.INVESTIGATE_TICKER,
        payload={
            "ticker": symbol,
            "holdings": [h.model_dump() for h in body.holdings],
        },
    )
    response = await _orchestrator.run(request)
    if not response.success and response.error:
        raise HTTPException(status_code=500, detail=response.error)
    return response
