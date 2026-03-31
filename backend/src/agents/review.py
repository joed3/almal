"""Review agent for the Almal multi-agent system.

This agent critically evaluates the research and optimization outputs, checking
for consistency, risk, and alignment with the user's investment objectives
before surfacing recommendations.
"""

import json

from anthropic import AsyncAnthropic

from src.agents.base import BaseAgent
from src.agents.types import AgentRequest, AgentResponse
from src.config.settings import get_settings

PORTFOLIO_CRITIQUE_SYSTEM_PROMPT = """\
You are a portfolio analyst. Given performance data, produce a structured \
markdown report.

Your response must follow this exact structure:

**Assessment**
One to two sentences summarising overall performance vs the benchmark(s).

**Key Observations**
- **[Label]:** observation with specific numbers
- **[Label]:** observation with specific numbers
(3–5 bullets)

**Metrics Summary**
A markdown table comparing the portfolio against each benchmark:
| Metric | Portfolio | [benchmark tickers as columns...] |
|---|---|---|
Include rows for: Total Return, Ann. Return, Sharpe Ratio, Max Drawdown, \
Volatility.
Format numbers as percentages where applicable (e.g. 32.5%).
Beta and Alpha rows are optional if relevant.

**Suggestions**
- **[Label]:** actionable suggestion
- **[Label]:** actionable suggestion
(2–3 bullets)

Be direct and quantitative. Use the actual numbers from the data provided.\
"""


class ReviewAgent(BaseAgent):
    """Critiques portfolio proposals and investment ideas using Claude."""

    def __init__(self) -> None:
        """Initialise the ReviewAgent."""
        super().__init__("review")
        settings = get_settings()
        self._anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def _execute(self, request: AgentRequest) -> AgentResponse:
        """Execute the review workflow.

        Accepts a ProfileResult in payload["profile_result"] and uses Claude
        to generate a structured markdown critique.

        Args:
            request: The structured request to process. payload must contain
                "profile_result" (a ProfileResult dict) and optionally
                "context" (one of "portfolio", "investment", "optimization").

        Returns:
            An AgentResponse with narrative populated and result={}.
        """
        profile_result = request.payload.get("profile_result", {})
        settings = get_settings()

        message = await self._anthropic.messages.create(
            model=settings.default_model,
            max_tokens=600,
            system=PORTFOLIO_CRITIQUE_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": json.dumps(profile_result),
                }
            ],
        )
        narrative = message.content[0].text.strip()  # type: ignore[union-attr]

        return AgentResponse(
            intent=request.intent,
            success=True,
            result={},
            narrative=narrative,
        )
