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
You are a portfolio analyst. Respond in under 250 words. \
Start with VERDICT on the first line, then use the sections below.

VERDICT: [OUTPERFORMING | ON PAR | UNDERPERFORMING]

**Summary**
1-2 sentences on overall performance vs benchmark(s).

**Observations**
- **[Label]:** finding with specific numbers
- **[Label]:** finding with specific numbers
- **[Label]:** finding with specific numbers

**Suggestions**
- **[Label]:** actionable improvement
- **[Label]:** actionable improvement

Be direct and quantitative. Use the actual numbers. Stay under 250 words.\
"""

INVESTMENT_CRITIQUE_SYSTEM_PROMPT = """\
You are an investment analyst. Respond in under 250 words. \
Start with VERDICT on the first line.

VERDICT: [STRONG | MODERATE | WEAK | AVOID]

**Investment Case**
1-2 sentences on the investment thesis.

**Strengths**
- **[Label]:** specific strength with numbers
- **[Label]:** specific strength with numbers

**Risks**
- **[Label]:** specific risk with numbers
- **[Label]:** specific risk with numbers

**Portfolio Fit** (include ONLY if portfolio fit data is provided — omit otherwise)
1 sentence on correlation and impact.

Be direct and quantitative. Stay under 250 words.\
"""

OPTIMIZATION_CRITIQUE_SYSTEM_PROMPT = """\
You are a quantitative portfolio manager. Respond in under 250 words. \
Start with VERDICT on the first line.

VERDICT: [STRONG | MODERATE | WEAK]

**Summary**
1-2 sentences on the allocation's risk/return profile.

**Strengths**
- **[Label]:** specific strength about the allocation
- **[Label]:** specific strength

**Risks**
- **[Label]:** concentration or model limitation
- **[Label]:** specific risk

Be direct and quantitative. Use the actual numbers. Stay under 250 words.\
"""

BACKTEST_CAVEAT_SYSTEM_PROMPT = """\
You are a quantitative analyst reviewing a walk-forward backtested portfolio strategy. \
Respond in under 200 words. Start with VERDICT on the first line.

This is a TRUE walk-forward backtest: at each rebalance date the portfolio was \
re-optimized using only price data available up to that point — no future data was \
used. The payload includes rebalance_cadence, rebalance_dates (the actual rebalance \
events), and optionally bah_stats (buy-and-hold comparison using the same strategy \
but never rebalancing). Do NOT claim there is look-ahead bias in the optimization.

VERDICT: [STRONG | MODERATE | WEAK]

**Performance**
1-2 sentences comparing the portfolio's walk-forward return and Sharpe vs. the \
benchmark (and vs. buy-and-hold if bah_stats is present).

**Caveats**
- **Estimation window:** results are sensitive to the historical period and training \
  window chosen.
- **Transaction costs:** rebalancing friction is not modelled — use the rebalance \
  count from the payload to quantify this.
- **[Observed risk]:** any specific concern from the numbers (e.g. low Sharpe, high \
  drawdown, underperformance vs. buy-and-hold).

Be direct. Use the actual numbers. Remind the reader that past performance \
does not guarantee future results. Stay under 200 words.\
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
        context = request.payload.get("context", "portfolio")
        settings = get_settings()

        if context == "investment":
            system_prompt = INVESTMENT_CRITIQUE_SYSTEM_PROMPT
        elif context == "optimization":
            system_prompt = OPTIMIZATION_CRITIQUE_SYSTEM_PROMPT
        elif context == "backtest":
            system_prompt = BACKTEST_CAVEAT_SYSTEM_PROMPT
        else:
            system_prompt = PORTFOLIO_CRITIQUE_SYSTEM_PROMPT

        message = await self._anthropic.messages.create(
            model=settings.default_model,
            max_tokens=600,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": json.dumps(profile_result, default=str),
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
