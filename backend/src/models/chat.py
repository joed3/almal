"""Pydantic models for the chat interface."""

from typing import Any

from pydantic import BaseModel, Field


class ChatContext(BaseModel):
    """Page context sent alongside every chat message."""

    page: str = Field(
        description="Active page: 'profiler', 'investigator', 'optimizer'."
    )
    portfolio: dict[str, Any] | None = Field(
        default=None, description="Serialised portfolio holdings summary."
    )
    current_result: dict[str, Any] | None = Field(
        default=None, description="Last result payload for the active page."
    )


class ChatRequest(BaseModel):
    """Incoming chat message from the frontend."""

    message: str
    context: ChatContext
    session_id: str = Field(
        description="Client-generated UUID, stable for the session."
    )


class ChatResponse(BaseModel):
    """Response returned to the frontend."""

    narrative: str = Field(description="Markdown-formatted assistant response.")
    action_type: str | None = Field(
        default=None,
        description="'optimize' or 'investigate' if an action was triggered.",
    )
    action_result: dict[str, Any] | None = Field(
        default=None, description="Structured result from the triggered agent action."
    )
    suggested_next: str | None = Field(
        default=None,
        description="A short follow-up suggestion shown below the response.",
    )
