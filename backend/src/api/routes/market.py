"""Market data API routes."""

import asyncio
from datetime import date, timedelta

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.agents.orchestrator import OrchestratorAgent
from src.agents.types import AgentIntent, AgentRequest, AgentResponse
from src.analysis.performance import PerformanceMetrics, PortfolioAnalyzer
from src.data.market import market_client
from src.models.market import PriceHistory, TickerInfo
from src.models.portfolio import Holding

router = APIRouter(prefix="/market", tags=["market"])

_orchestrator = OrchestratorAgent()


class PortfolioFitRequest(BaseModel):
    """Request body for the portfolio fit endpoint."""

    holdings: list[Holding]


class SuggestRequest(BaseModel):
    """Request body for the suggest-diversifiers endpoint."""

    holdings: list[Holding]
    candidates: list[str]


class SectorRequest(BaseModel):
    """Request body for the batch sector lookup endpoint."""

    tickers: list[str]


class TickerMeta(BaseModel):
    """Sector and name metadata for a single ticker."""

    ticker: str
    name: str | None = None
    sector: str | None = None


class SuggestionItem(BaseModel):
    """A single suggestion result."""

    ticker: str
    correlation: float
    performance: PerformanceMetrics
    info: TickerInfo


class SuggestResponse(BaseModel):
    """Response from the suggest-diversifiers endpoint."""

    suggestions: list[SuggestionItem]
    correlation_matrix: dict[str, dict[str, float]] | None = None
    portfolio_ticker_metrics: dict[str, PerformanceMetrics] | None = None


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


@router.post("/suggest", response_model=SuggestResponse)
async def suggest_diversifiers(body: SuggestRequest) -> SuggestResponse:
    """Score candidate symbols by their diversification value against an existing
    portfolio.

    Computes 1-year price correlation between each candidate and the portfolio
    value series, then returns all valid candidates sorted by correlation ascending
    (lowest = strongest diversifier).  Already-owned tickers are excluded automatically.

    Args:
        body: SuggestRequest containing the current holdings and candidate tickers.

    Returns:
        SuggestResponse with suggestions sorted by correlation ascending.
    """
    portfolio_tickers = {h.ticker.upper() for h in body.holdings}
    # Deduplicate and exclude already-owned tickers
    seen: set[str] = set()
    candidates: list[str] = []
    for c in body.candidates:
        upper = c.upper()
        if upper not in portfolio_tickers and upper not in seen:
            seen.add(upper)
            candidates.append(upper)

    if not candidates or not body.holdings:
        return SuggestResponse(suggestions=[])

    end_date = date.today()
    start_date = end_date - timedelta(days=365)

    # Limit concurrent yfinance threads to avoid rate-limiting
    semaphore = asyncio.Semaphore(12)

    async def _fetch_history(ticker: str) -> tuple[str, PriceHistory | None]:
        async with semaphore:
            try:
                return ticker, await asyncio.to_thread(
                    market_client.fetch_price_history, ticker, start_date, end_date
                )
            except Exception:
                return ticker, None

    # Fetch price histories for portfolio holdings + all candidates concurrently
    all_tickers = list(portfolio_tickers) + candidates
    history_pairs = await asyncio.gather(*[_fetch_history(t) for t in all_tickers])
    all_histories: dict[str, PriceHistory] = {
        t: h for t, h in history_pairs if h is not None
    }

    # Build portfolio value series
    analyzer = PortfolioAnalyzer()
    available_holdings = [h for h in body.holdings if h.ticker in all_histories]
    holding_histories_map = {
        t: h for t, h in all_histories.items() if t in portfolio_tickers
    }
    portfolio_series = analyzer.compute_portfolio_series(
        available_holdings, holding_histories_map
    )

    if portfolio_series.empty:
        return SuggestResponse(suggestions=[])

    port_daily = portfolio_series.pct_change().dropna()

    # Compute correlation and 1Y performance metrics for each valid candidate
    valid: list[tuple[str, float, PerformanceMetrics]] = []
    for ticker in candidates:
        history = all_histories.get(ticker)
        if history is None or not history.bars:
            continue

        closes = [bar.close for bar in history.bars]
        dates_idx = [pd.to_datetime(bar.date) for bar in history.bars]
        cand_series = pd.Series(closes, index=dates_idx).ffill(limit=5).dropna()

        if len(cand_series) < 20 or cand_series.iloc[0] == 0:
            continue

        cand_norm = cand_series / cand_series.iloc[0]
        cand_daily = cand_norm.pct_change().dropna()
        aligned_cand, aligned_port = cand_daily.align(port_daily, join="inner")

        if len(aligned_cand) < 20:
            continue

        correlation = round(float(aligned_cand.corr(aligned_port)), 3)
        performance = analyzer.compute_ticker_metrics(history)
        valid.append((ticker, correlation, performance))

    if not valid:
        return SuggestResponse(suggestions=[])

    # Fetch ticker info (name, sector) for all valid candidates concurrently
    async def _fetch_info(ticker: str) -> tuple[str, TickerInfo]:
        async with semaphore:
            try:
                return ticker, await asyncio.to_thread(
                    market_client.fetch_ticker_info, ticker
                )
            except Exception:
                return ticker, TickerInfo(ticker=ticker)

    info_pairs = await asyncio.gather(*[_fetch_info(t) for t, _, _ in valid])
    info_map: dict[str, TickerInfo] = dict(info_pairs)

    suggestions = [
        SuggestionItem(
            ticker=ticker,
            correlation=correlation,
            performance=performance,
            info=info_map.get(ticker, TickerInfo(ticker=ticker)),
        )
        for ticker, correlation, performance in valid
    ]
    suggestions.sort(key=lambda s: s.correlation)

    # Correlation matrix: portfolio holdings + all valid candidates
    matrix_tickers = list(portfolio_tickers) + [t for t, _, _ in valid]
    corr_matrix = analyzer.compute_correlation_matrix(matrix_tickers, all_histories)

    # Per-ticker performance metrics for portfolio holdings (for scatter plot)
    portfolio_ticker_metrics = {
        t: analyzer.compute_ticker_metrics(all_histories[t])
        for t in portfolio_tickers
        if t in all_histories
    }

    return SuggestResponse(
        suggestions=suggestions,
        correlation_matrix=corr_matrix or None,
        portfolio_ticker_metrics=portfolio_ticker_metrics or None,
    )


@router.post("/sectors", response_model=list[TickerMeta])
async def get_ticker_sectors(body: SectorRequest) -> list[TickerMeta]:
    """Return name and sector metadata for a batch of tickers.

    Args:
        body: SectorRequest with a list of ticker symbols.

    Returns:
        List of TickerMeta with ticker, name, and sector for each symbol.
        Unknown tickers get None for name and sector rather than erroring.
    """
    semaphore = asyncio.Semaphore(12)

    async def _fetch(ticker: str) -> TickerMeta:
        async with semaphore:
            try:
                info = await asyncio.to_thread(market_client.fetch_ticker_info, ticker)
                return TickerMeta(ticker=ticker, name=info.name, sector=info.sector)
            except Exception:
                return TickerMeta(ticker=ticker)

    results = await asyncio.gather(*[_fetch(t.upper()) for t in body.tickers])
    return list(results)
