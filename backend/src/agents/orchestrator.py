"""Orchestrator agent for the Almal multi-agent system.

This agent coordinates the research, optimizer, and review agents,
managing the overall workflow for portfolio monitoring and optimization tasks.
"""

from anthropic import AsyncAnthropic

from src.agents.base import BaseAgent
from src.agents.optimizer import OptimizerAgent
from src.agents.research import ResearchAgent
from src.agents.review import ReviewAgent
from src.agents.types import AgentIntent, AgentRequest, AgentResponse
from src.config.settings import get_settings

CLASSIFICATION_SYSTEM_PROMPT = (
    "You are a routing assistant for a portfolio management tool.\n"
    "Classify the user's message into exactly one of these intents and\n"
    "respond with only the intent key:\n"
    "- profile_portfolio: user wants to analyse or profile an existing portfolio\n"
    "- investigate_ticker: user wants to research or investigate a specific stock"
    " or ETF\n"
    "- optimize_portfolio: user wants to optimise or rebalance a portfolio\n"
    "- general: does not clearly fit any of the above\n"
)


class OrchestratorAgent(BaseAgent):
    """Routes requests to the appropriate specialist agent.

    Attributes:
        _client: Async Anthropic client for NL classification.
        _agents: Map from AgentIntent to the handling specialist agent.
        _review_agent: ReviewAgent instance for post-processing.
    """

    def __init__(self) -> None:
        """Initialise the OrchestratorAgent and all specialist agents."""
        super().__init__("orchestrator")
        settings = get_settings()
        self._client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        self._agents: dict[AgentIntent, BaseAgent] = {
            AgentIntent.PROFILE_PORTFOLIO: ResearchAgent(),
            AgentIntent.INVESTIGATE_TICKER: ResearchAgent(),
            AgentIntent.OPTIMIZE_PORTFOLIO: OptimizerAgent(),
        }
        self._review_agent = ReviewAgent()

    async def _execute(self, request: AgentRequest) -> AgentResponse:
        """Route the request to the appropriate specialist agent.

        When the intent is GENERAL, Claude is used to classify the user message
        into one of the specialist intents before routing.

        Args:
            request: The incoming agent request.

        Returns:
            The AgentResponse from the selected specialist agent, or an error
            response if no agent is registered for the resolved intent.
        """
        intent = request.intent
        if intent == AgentIntent.GENERAL:
            intent = await self._classify(request.user_message or "")
            request = AgentRequest(
                intent=intent,
                payload=request.payload,
                user_message=request.user_message,
            )

        agent = self._agents.get(intent)
        if agent is None:
            return AgentResponse(
                intent=intent,
                success=False,
                result={},
                error=f"No agent registered for intent: {intent}",
            )

        return await agent.run(request)

    async def _classify(self, user_message: str) -> AgentIntent:
        """Use Claude to classify a natural-language message into an AgentIntent.

        Args:
            user_message: The raw user input to classify.

        Returns:
            The classified AgentIntent, falling back to GENERAL if the model
            returns an unrecognised value.
        """
        settings = get_settings()
        message = await self._client.messages.create(
            model=settings.orchestrator_model,
            max_tokens=16,
            system=CLASSIFICATION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = message.content[0].text.strip().lower()  # type: ignore[union-attr]
        try:
            return AgentIntent(raw)
        except ValueError:
            return AgentIntent.GENERAL
