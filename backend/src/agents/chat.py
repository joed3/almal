"""Chat agent for the Almal multi-agent system.

Handles conversational interactions by classifying messages, answering questions
about current results, and executing portfolio actions on the user's behalf.
"""

import json
import logging
from typing import Any

from anthropic import AsyncAnthropic

from src.agents.research import ResearchAgent
from src.agents.types import AgentIntent, AgentRequest
from src.analysis.optimization import PortfolioOptimizer
from src.config.settings import get_settings
from src.models.chat import ChatContext, ChatResponse
from src.models.optimizer import OptimizationStrategy

logger = logging.getLogger(__name__)

# Session history: session_id -> list of {"role": ..., "content": ...} dicts
_sessions: dict[str, list[dict[str, str]]] = {}
_MAX_HISTORY = 10  # message pairs to keep per session

CHAT_SYSTEM_PROMPT = """\
You are a financial assistant for Almal, a portfolio management tool. \
You help users with portfolio analysis, optimization, and investment research.

You will receive a JSON object containing:
- "message": the user's message
- "context": { "page", "portfolio", "current_result" }
- "history": prior conversation turns (most recent last)

Respond with a JSON object — no markdown, no explanation, just valid JSON:
{{
  "narrative": "Your response (markdown supported, be concise and direct)",
  "action_type": null | "optimize" | "investigate",
  "action_params": null | {{ ... }},
  "suggested_next": null | "Short follow-up suggestion"
}}

You CAN trigger actions when the user clearly requests a portfolio operation:

"optimize" action_params: {{
  "tickers": ["AAPL", "MSFT"],   // infer from portfolio or current result
  "strategy": "max_sharpe",       // one of: min_volatility, max_sharpe,
                                  //   max_return, regularized_sharpe,
                                  //   risk_parity, cvar, hrp, black_litterman
  "principal": 100000,            // infer from current result or 100000
  "lookback_years": 3
}}

"investigate" action_params:
{{
  "ticker": "AAPL"
}}

Rules:
- Only trigger an action if the user clearly wants a portfolio operation — not for \
  questions or explanations
- When answering questions about current results, use the actual numbers from \
  "current_result"
- Keep narrative concise; use bullet points for multiple findings
- If no portfolio is loaded and the user wants to optimize, explain they need to \
  upload one or specify tickers
- suggested_next should be a short concrete prompt the user could send next, \
  or null if not helpful\
"""


class ChatAgent:
    """Routes chat messages to appropriate responses and agent actions."""

    def __init__(self) -> None:
        """Initialise the ChatAgent."""
        settings = get_settings()
        self._anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def respond(
        self, message: str, context: ChatContext, session_id: str
    ) -> ChatResponse:
        """Process a chat message and return a response.

        Args:
            message: The user's raw message.
            context: Page context (page name, portfolio, current result).
            session_id: Stable client session identifier.

        Returns:
            A ChatResponse with narrative, optional action result, and suggestion.
        """
        settings = get_settings()
        history = _sessions.get(session_id, [])

        payload = {
            "message": message,
            "context": {
                "page": context.page,
                "portfolio": _summarise_portfolio(context.portfolio),
                "current_result": _summarise_result(context.current_result),
            },
            "history": history[-_MAX_HISTORY * 2 :],
        }

        msg = await self._anthropic.messages.create(
            model=settings.default_model,
            max_tokens=1000,
            system=CHAT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(payload)}],
        )

        raw = msg.content[0].text.strip()  # type: ignore[union-attr]
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        data = json.loads(raw)
        narrative: str = data.get("narrative", "")
        action_type: str | None = data.get("action_type")
        action_params: dict[str, Any] | None = data.get("action_params")
        suggested_next: str | None = data.get("suggested_next")

        # Execute the action if requested
        action_result: dict[str, Any] | None = None
        if action_type and action_params:
            try:
                action_result = await self._execute_action(
                    action_type, action_params, context
                )
            except Exception as e:
                logger.warning(f"Chat action failed ({action_type}): {e}")
                narrative += f"\n\n*(Action could not be completed: {e})*"

        # Update session history
        history.append({"role": "user", "content": message})
        history.append({"role": "assistant", "content": narrative})
        _sessions[session_id] = history[-_MAX_HISTORY * 2 :]

        return ChatResponse(
            narrative=narrative,
            action_type=action_type,
            action_result=action_result,
            suggested_next=suggested_next,
        )

    async def _execute_action(
        self, action_type: str, params: dict[str, Any], context: ChatContext
    ) -> dict[str, Any]:
        """Execute an agent action and return the structured result.

        Args:
            action_type: 'optimize' or 'investigate'.
            params: Action-specific parameters from the chat response.
            context: Page context for additional tickers/portfolio info.

        Returns:
            Serialised action result dict.
        """
        if action_type == "optimize":
            tickers: list[str] = params.get("tickers") or []
            # Fall back to portfolio tickers if none specified
            if not tickers and context.portfolio:
                holdings = context.portfolio.get("holdings", [])
                tickers = [h["ticker"] for h in holdings if "ticker" in h]
            if len(tickers) < 2:
                raise ValueError("Need at least 2 tickers to optimize.")

            raw_strategy = params.get("strategy", "max_sharpe")
            try:
                strategy = OptimizationStrategy(raw_strategy)
            except ValueError:
                strategy = OptimizationStrategy.MAX_SHARPE

            optimizer = PortfolioOptimizer()
            result = optimizer.optimize(
                tickers=tickers,
                new_cash=float(params.get("principal", 100_000)),
                current_portfolio={},
                strategy=strategy,
                lookback_days=int(params.get("lookback_years", 3)) * 365,
            )
            return result.model_dump()

        if action_type == "investigate":
            ticker: str = params.get("ticker", "")
            if not ticker:
                raise ValueError("No ticker specified for investigation.")
            agent = ResearchAgent()
            req = AgentRequest(
                intent=AgentIntent.INVESTIGATE_TICKER,
                payload={"ticker": ticker},
            )
            resp = await agent.run(req)
            if not resp.success:
                raise ValueError(resp.error or "Investigation failed.")
            return resp.result

        raise ValueError(f"Unknown action type: {action_type}")


def _summarise_portfolio(portfolio: dict[str, Any] | None) -> dict[str, Any] | None:
    """Return a compact portfolio summary suitable for the system prompt."""
    if not portfolio:
        return None
    holdings = portfolio.get("holdings", [])
    return {
        "holding_count": len(holdings),
        "tickers": [h.get("ticker") for h in holdings[:20]],
    }


def _summarise_result(result: dict[str, Any] | None) -> dict[str, Any] | None:
    """Return a truncated result summary to avoid exceeding the context window."""
    if not result:
        return None
    # Trim large arrays (e.g. frontier_curve, dates) from the result
    summary = {}
    for k, v in result.items():
        if isinstance(v, list) and len(v) > 10:
            summary[k] = v[:5]
        else:
            summary[k] = v
    return summary
