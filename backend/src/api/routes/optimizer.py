from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.agents.constraint_parser import ConstraintParserAgent
from src.agents.orchestrator import OrchestratorAgent
from src.agents.review import ReviewAgent
from src.agents.types import AgentIntent, AgentRequest, AgentResponse
from src.analysis.optimization import PortfolioOptimizer
from src.models.optimizer import (
    BacktestRequest,
    BacktestResult,
    OptimizeRequest,
    ParseConstraintsRequest,
    ParseConstraintsResponse,
)

router = APIRouter(prefix="/optimize", tags=["optimizer"])

# Initialize exactly one orchestrator for this router module
_orchestrator = OrchestratorAgent()
_review_agent = ReviewAgent()


class BacktestResponse(BaseModel):
    """Response from the backtest endpoint."""

    success: bool
    result: BacktestResult | None = None
    narrative: str | None = None
    error: str | None = None


@router.post("", response_model=AgentResponse)
async def optimize_portfolio(request: OptimizeRequest) -> AgentResponse:
    """Run portfolio optimization using PyPortfolioOpt.

    Accepts a list of ticker symbols, a principal amount, and an optimization strategy.
    Returns the mathematically optimal allocations, expected metrics, the
    efficient frontier curve, and a generated critique.

    Args:
        request: An OptimizeRequest containing strategy and candidates.

    Returns:
        An AgentResponse wrapping the OptimizeResult dict and critique narrative.
    """
    agent_req = AgentRequest(
        intent=AgentIntent.OPTIMIZE_PORTFOLIO,
        payload=request.model_dump(),
    )
    response = await _orchestrator.run(agent_req)
    if not response.success:
        raise HTTPException(
            status_code=400,
            detail=response.error or "Failed to optimize portfolio.",
        )
    return response


@router.post("/parse-constraints", response_model=ParseConstraintsResponse)
async def parse_constraints(
    request: ParseConstraintsRequest,
) -> ParseConstraintsResponse:
    """Parse a natural language portfolio constraint into a structured ConstraintSet.

    Args:
        request: Free-text constraint plus available tickers and lot data.

    Returns:
        Parsed ConstraintSet, display chips, and an optional clarification question.
    """
    agent = ConstraintParserAgent()
    try:
        constraints, chips, clarification = await agent.parse(
            text=request.text,
            tickers=request.tickers,
            lots=request.lots,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse constraints: {e}")
    return ParseConstraintsResponse(
        constraints=constraints,
        chips=chips,
        clarification_needed=clarification,
    )


@router.post("/backtest", response_model=BacktestResponse)
async def run_backtest(request: BacktestRequest) -> BacktestResponse:
    """Run a historical backtest simulation for a set of optimized weights.

    Applies the provided weights statically to the historical price data over the
    requested lookback window and computes cumulative returns, annualized return,
    volatility, Sharpe ratio, max drawdown, and Calmar ratio vs. the benchmark.

    Args:
        request: A BacktestRequest containing tickers, weights, benchmark, and window.

    Returns:
        A BacktestResponse with the simulation results and a Review Agent caveat note.
    """
    optimizer = PortfolioOptimizer()
    try:
        result = optimizer.run_backtest(
            tickers=request.tickers,
            strategy=request.strategy,
            cadence=request.cadence,
            benchmark=request.benchmark,
            lookback_years=request.lookback_years,
            advanced_params=request.advanced_params,
            views=request.views,
        )
    except ValueError as e:
        return BacktestResponse(success=False, error=str(e))
    except Exception as e:
        return BacktestResponse(success=False, error=f"Backtest failed: {e}")

    # Get Review Agent caveat note
    narrative: str | None = None
    try:
        review_req = AgentRequest(
            intent=AgentIntent.OPTIMIZE_PORTFOLIO,
            payload={"profile_result": result.model_dump(), "context": "backtest"},
        )
        review_resp = await _review_agent.run(review_req)
        if review_resp.success:
            narrative = review_resp.narrative
    except Exception:
        pass  # narrative is optional

    return BacktestResponse(success=True, result=result, narrative=narrative)
