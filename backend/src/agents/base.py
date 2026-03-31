"""Abstract base class for all Almal agents."""

import logging
from abc import ABC, abstractmethod

from src.agents.types import AgentRequest, AgentResponse


class BaseAgent(ABC):
    """Abstract base for all Almal agents.

    Attributes:
        name: Human-readable agent name used in log messages.
        logger: Logger instance scoped to this agent.
    """

    def __init__(self, name: str) -> None:
        """Initialise the base agent.

        Args:
            name: Identifier for this agent, used in logging.
        """
        self.name = name
        self.logger = logging.getLogger(f"almal.agents.{name}")

    async def run(self, request: AgentRequest) -> AgentResponse:
        """Entry point — wraps _execute with logging and error handling.

        Args:
            request: The structured request to process.

        Returns:
            An AgentResponse with success=True on success, or success=False
            and an error message if an unexpected exception is raised.

        Raises:
            NotImplementedError: Propagated if _execute raises it.
        """
        self.logger.info("Agent %s starting for intent %s", self.name, request.intent)
        try:
            response = await self._execute(request)
            self.logger.info("Agent %s completed successfully", self.name)
            return response
        except NotImplementedError:
            raise
        except Exception as exc:
            self.logger.error("Agent %s failed: %s", self.name, exc)
            return AgentResponse(
                intent=request.intent,
                success=False,
                result={},
                error=str(exc),
            )

    @abstractmethod
    async def _execute(self, request: AgentRequest) -> AgentResponse:
        """Implement agent logic here.

        Args:
            request: The structured request to process.

        Returns:
            An AgentResponse with the agent's results.
        """
