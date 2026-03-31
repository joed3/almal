"""Review agent for the Almal multi-agent system.

This agent critically evaluates the research and optimization outputs, checking
for consistency, risk, and alignment with the user's investment objectives before
surfacing recommendations.
"""

from src.agents.base import BaseAgent
from src.agents.types import AgentRequest, AgentResponse


class ReviewAgent(BaseAgent):
    """Critiques portfolio proposals and investment ideas using Claude."""

    def __init__(self) -> None:
        """Initialise the ReviewAgent."""
        super().__init__("review")

    async def _execute(self, request: AgentRequest) -> AgentResponse:
        """Execute the review workflow.

        Args:
            request: The structured request to process.

        Returns:
            An AgentResponse with review results.

        Raises:
            NotImplementedError: This method is not yet implemented.
        """
        raise NotImplementedError
