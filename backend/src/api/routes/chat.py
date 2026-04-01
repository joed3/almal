from fastapi import APIRouter, HTTPException

from src.agents.chat import ChatAgent
from src.models.chat import ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["chat"])

_chat_agent = ChatAgent()


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Handle a chat message from the user.

    Classifies the message, answers questions about current results, or
    triggers an agent action (optimize / investigate) and returns the result.

    Args:
        request: Message, page context, and session ID.

    Returns:
        A ChatResponse with narrative, optional action result, and suggestion.
    """
    try:
        return await _chat_agent.respond(
            message=request.message,
            context=request.context,
            session_id=request.session_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {e}")
