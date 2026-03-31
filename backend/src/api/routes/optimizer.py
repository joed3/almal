from fastapi import APIRouter, HTTPException

from src.agents.orchestrator import OrchestratorAgent
from src.agents.types import AgentIntent, AgentRequest, AgentResponse
from src.models.optimizer import OptimizeRequest

router = APIRouter(prefix="/optimize", tags=["optimizer"])

# Initialize exactly one orchestrator for this router module
_orchestrator = OrchestratorAgent()


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
