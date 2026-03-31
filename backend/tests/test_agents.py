"""Tests for the Almal multi-agent infrastructure."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from src.agents.base import BaseAgent
from src.agents.optimizer import OptimizerAgent
from src.agents.orchestrator import OrchestratorAgent
from src.agents.research import ResearchAgent
from src.agents.review import ReviewAgent
from src.agents.types import AgentIntent, AgentRequest, AgentResponse
from src.api.main import app

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_request(
    intent: AgentIntent,
    payload: dict[str, Any] | None = None,
    user_message: str | None = None,
) -> AgentRequest:
    return AgentRequest(
        intent=intent,
        payload=payload or {},
        user_message=user_message,
    )


def _success_response(intent: AgentIntent) -> AgentResponse:
    return AgentResponse(intent=intent, success=True, result={"ok": True})


# ---------------------------------------------------------------------------
# Orchestrator routing — structured intents
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_orchestrator_routes_investigate_ticker() -> None:
    """INVESTIGATE_TICKER is routed to ResearchAgent."""
    request = _make_request(AgentIntent.INVESTIGATE_TICKER)
    expected = _success_response(AgentIntent.INVESTIGATE_TICKER)

    with (
        patch.object(ResearchAgent, "_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(ReviewAgent, "_execute", new_callable=AsyncMock) as mock_review,
    ):
        mock_exec.return_value = expected
        mock_review.return_value = _success_response(AgentIntent.INVESTIGATE_TICKER)
        orchestrator = OrchestratorAgent()
        response = await orchestrator.run(request)

    mock_exec.assert_called_once_with(request)
    assert response.success is True
    assert response.intent == AgentIntent.INVESTIGATE_TICKER


@pytest.mark.asyncio
async def test_orchestrator_routes_optimize_portfolio() -> None:
    """OPTIMIZE_PORTFOLIO is routed to OptimizerAgent."""
    request = _make_request(AgentIntent.OPTIMIZE_PORTFOLIO)
    expected = _success_response(AgentIntent.OPTIMIZE_PORTFOLIO)

    with (
        patch.object(OptimizerAgent, "_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(ReviewAgent, "_execute", new_callable=AsyncMock) as mock_review,
    ):
        mock_exec.return_value = expected
        mock_review.return_value = _success_response(AgentIntent.OPTIMIZE_PORTFOLIO)
        orchestrator = OrchestratorAgent()
        response = await orchestrator.run(request)

    mock_exec.assert_called_once_with(request)
    assert response.success is True
    assert response.intent == AgentIntent.OPTIMIZE_PORTFOLIO


@pytest.mark.asyncio
async def test_orchestrator_routes_profile_portfolio() -> None:
    """PROFILE_PORTFOLIO is routed to ResearchAgent."""
    request = _make_request(AgentIntent.PROFILE_PORTFOLIO)
    expected = _success_response(AgentIntent.PROFILE_PORTFOLIO)

    with (
        patch.object(ResearchAgent, "_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(ReviewAgent, "_execute", new_callable=AsyncMock) as mock_review,
    ):
        mock_exec.return_value = expected
        mock_review.return_value = _success_response(AgentIntent.PROFILE_PORTFOLIO)
        orchestrator = OrchestratorAgent()
        response = await orchestrator.run(request)

    mock_exec.assert_called_once_with(request)
    assert response.success is True
    assert response.intent == AgentIntent.PROFILE_PORTFOLIO


# ---------------------------------------------------------------------------
# Orchestrator NL classification
# ---------------------------------------------------------------------------


def _mock_anthropic_response(text: str) -> MagicMock:
    """Build a mock Anthropic API response containing the given text."""
    content_block = MagicMock()
    content_block.text = text
    message = MagicMock()
    message.content = [content_block]
    return message


@pytest.mark.asyncio
async def test_orchestrator_classifies_nl_investigate() -> None:
    """GENERAL request with 'Apple stock' message is routed to INVESTIGATE_TICKER."""
    request = _make_request(
        AgentIntent.GENERAL, user_message="Tell me about Apple stock"
    )
    expected = _success_response(AgentIntent.INVESTIGATE_TICKER)

    mock_message = _mock_anthropic_response("investigate_ticker")

    with (
        patch("src.agents.orchestrator.AsyncAnthropic") as mock_anthropic_cls,
        patch.object(ResearchAgent, "_execute", new_callable=AsyncMock) as mock_exec,
        patch.object(ReviewAgent, "_execute", new_callable=AsyncMock) as mock_review,
    ):
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_message)
        mock_anthropic_cls.return_value = mock_client
        mock_exec.return_value = expected
        mock_review.return_value = _success_response(AgentIntent.INVESTIGATE_TICKER)

        orchestrator = OrchestratorAgent()
        response = await orchestrator.run(request)

    mock_client.messages.create.assert_called_once()
    mock_exec.assert_called_once()
    assert response.success is True
    assert response.intent == AgentIntent.INVESTIGATE_TICKER


@pytest.mark.asyncio
async def test_orchestrator_classifies_nl_fallback() -> None:
    """GENERAL request with unrecognised classification falls back to GENERAL intent."""
    request = _make_request(
        AgentIntent.GENERAL, user_message="What is the weather today?"
    )
    mock_message = _mock_anthropic_response("totally_unknown_intent_xyz")

    with patch("src.agents.orchestrator.AsyncAnthropic") as mock_anthropic_cls:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_message)
        mock_anthropic_cls.return_value = mock_client

        orchestrator = OrchestratorAgent()
        response = await orchestrator.run(request)

    # No agent is registered for GENERAL, so we get a failure response.
    assert response.success is False
    assert response.error is not None
    assert "general" in response.error.lower()


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


class _ErrorAgent(BaseAgent):
    """Test agent that raises a generic exception."""

    def __init__(self) -> None:
        super().__init__("error_agent")

    async def _execute(self, request: AgentRequest) -> AgentResponse:
        raise RuntimeError("something went wrong")


class _NotImplementedAgent(BaseAgent):
    """Test agent that raises NotImplementedError."""

    def __init__(self) -> None:
        super().__init__("not_implemented_agent")

    async def _execute(self, request: AgentRequest) -> AgentResponse:
        raise NotImplementedError


@pytest.mark.asyncio
async def test_agent_run_catches_exception() -> None:
    """BaseAgent.run returns success=False when _execute raises a generic exception."""
    agent = _ErrorAgent()
    request = _make_request(AgentIntent.GENERAL)
    response = await agent.run(request)

    assert response.success is False
    assert response.error == "something went wrong"
    assert response.result == {}


@pytest.mark.asyncio
async def test_agent_run_propagates_not_implemented() -> None:
    """BaseAgent.run propagates NotImplementedError without catching it."""
    agent = _NotImplementedAgent()
    request = _make_request(AgentIntent.GENERAL)

    with pytest.raises(NotImplementedError):
        await agent.run(request)


# ---------------------------------------------------------------------------
# POST /agent/run endpoint
# ---------------------------------------------------------------------------


@pytest.fixture
async def http_client() -> AsyncClient:
    """Async HTTP client bound to the FastAPI app."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest.mark.asyncio
async def test_agent_run_endpoint_success(http_client: AsyncClient) -> None:
    """POST /agent/run returns 200 when the orchestrator succeeds."""
    success_response = AgentResponse(
        intent=AgentIntent.INVESTIGATE_TICKER,
        success=True,
        result={"ticker": "AAPL"},
    )

    with patch(
        "src.api.routes.agent._orchestrator.run",
        new_callable=AsyncMock,
        return_value=success_response,
    ):
        resp = await http_client.post(
            "/agent/run",
            json={
                "intent": "investigate_ticker",
                "payload": {"ticker": "AAPL"},
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["intent"] == "investigate_ticker"


@pytest.mark.asyncio
async def test_agent_run_endpoint_error(http_client: AsyncClient) -> None:
    """POST /agent/run returns 500 when the orchestrator returns success=False."""
    error_response = AgentResponse(
        intent=AgentIntent.INVESTIGATE_TICKER,
        success=False,
        result={},
        error="Internal failure",
    )

    with patch(
        "src.api.routes.agent._orchestrator.run",
        new_callable=AsyncMock,
        return_value=error_response,
    ):
        resp = await http_client.post(
            "/agent/run",
            json={
                "intent": "investigate_ticker",
                "payload": {},
            },
        )

    assert resp.status_code == 500
    assert "Internal failure" in resp.json()["detail"]
