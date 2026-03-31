"""Market data API routes."""

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException

from src.data.market import market_client
from src.models.market import PriceHistory, TickerInfo

router = APIRouter(prefix="/market", tags=["market"])


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
