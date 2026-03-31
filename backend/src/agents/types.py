"""Shared types for the Almal multi-agent system.

Defines the typed request/response contract shared across all agents.
"""

from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class AgentIntent(StrEnum):
    """Enumerates the supported agent intents."""

    PROFILE_PORTFOLIO = "profile_portfolio"
    INVESTIGATE_TICKER = "investigate_ticker"
    OPTIMIZE_PORTFOLIO = "optimize_portfolio"
    GENERAL = "general"


class AgentRequest(BaseModel):
    """Request payload passed to any agent.

    Attributes:
        intent: The classified or explicit intent for this request.
        payload: Intent-specific structured data.
        user_message: Raw natural-language input, used for GENERAL intent.
    """

    intent: AgentIntent
    payload: dict[str, Any]
    user_message: str | None = None


class AgentResponse(BaseModel):
    """Response returned by any agent.

    Attributes:
        intent: The intent that was processed.
        success: Whether the agent completed successfully.
        result: Agent-specific structured output.
        narrative: Optional natural-language summary from the Review agent.
        error: Human-readable error message if success is False.
    """

    intent: AgentIntent
    success: bool
    result: dict[str, Any]
    narrative: str | None = None
    error: str | None = None
