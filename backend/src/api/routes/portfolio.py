"""Portfolio API routes."""

from datetime import date

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from src.agents.orchestrator import OrchestratorAgent
from src.agents.types import AgentIntent, AgentRequest, AgentResponse
from src.data.csv_parser import parse_portfolio_csv
from src.models.portfolio import Portfolio

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

_orchestrator = OrchestratorAgent()


class AnalyzeRequest(BaseModel):
    """Request body for the portfolio analyze endpoint.

    Attributes:
        portfolio: The portfolio to analyze.
        benchmarks: List of benchmark ticker symbols, defaults to ["SPY"].
        start_date: Start of the analysis period.
        end_date: End of the analysis period.
    """

    portfolio: Portfolio
    benchmarks: list[str] = ["SPY"]
    start_date: date
    end_date: date


@router.post("/upload", response_model=Portfolio)
async def upload_portfolio(file: UploadFile) -> Portfolio:
    """Parse an uploaded CSV file and return a Portfolio.

    Args:
        file: Multipart CSV file upload.

    Returns:
        Parsed Portfolio derived from the CSV contents.

    Raises:
        HTTPException: 422 if the CSV cannot be parsed (e.g. missing
            ticker column).
    """
    content = await file.read()
    try:
        return parse_portfolio_csv(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/analyze", response_model=AgentResponse)
async def analyze_portfolio(body: AnalyzeRequest) -> AgentResponse:
    """Profile a portfolio against benchmarks over a date range.

    Args:
        body: AnalyzeRequest containing the portfolio, benchmark tickers,
            start_date, and end_date.

    Returns:
        AgentResponse with a ProfileResult in result and optional narrative.

    Raises:
        HTTPException: 500 if the agent pipeline returns an error.
    """
    agent_request = AgentRequest(
        intent=AgentIntent.PROFILE_PORTFOLIO,
        payload={
            "holdings": [h.model_dump() for h in body.portfolio.holdings],
            "benchmarks": body.benchmarks,
            "start_date": body.start_date.isoformat(),
            "end_date": body.end_date.isoformat(),
        },
    )
    response = await _orchestrator.run(agent_request)
    if not response.success and response.error:
        raise HTTPException(status_code=500, detail=response.error)
    return response
