"""Research agent for the Almal multi-agent system.

This agent is responsible for gathering market data, news, and fundamental
information about securities in the portfolio using external data sources.
"""

from src.agents.base import BaseAgent
from src.agents.types import AgentRequest, AgentResponse


class ResearchAgent(BaseAgent):
    """Fetches and summarises market data for a given ticker or portfolio."""

    def __init__(self) -> None:
        """Initialise the ResearchAgent."""
        super().__init__("research")

    async def _execute(self, request: AgentRequest) -> AgentResponse:
        """Execute the research workflow.

        Args:
            request: The structured request to process.

        Returns:
            An AgentResponse with research results.

        Raises:
            NotImplementedError: This method is not yet implemented.
        """
        raise NotImplementedError
