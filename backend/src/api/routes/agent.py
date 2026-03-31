"""API route for running agent requests through the orchestrator."""

from fastapi import APIRouter, HTTPException

from src.agents.orchestrator import OrchestratorAgent
from src.agents.types import AgentRequest, AgentResponse

router = APIRouter(prefix="/agent", tags=["agent"])
_orchestrator = OrchestratorAgent()


@router.post("/run", response_model=AgentResponse)
async def run_agent(request: AgentRequest) -> AgentResponse:
    """Route an agent request through the orchestrator.

    Args:
        request: The structured agent request to process.

    Returns:
        The AgentResponse from the appropriate specialist agent.

    Raises:
        HTTPException: 500 if the agent returns success=False with an error.
    """
    response = await _orchestrator.run(request)
    if not response.success and response.error:
        raise HTTPException(status_code=500, detail=response.error)
    return response
