"""Optimizer agent for the Almal multi-agent system.

This agent applies quantitative portfolio optimization techniques (mean-variance,
risk parity, etc.) to generate optimal portfolio weight allocations.
"""

from src.agents.base import BaseAgent
from src.agents.types import AgentIntent, AgentRequest, AgentResponse
from src.analysis.optimization import PortfolioOptimizer
from src.models.optimizer import OptimizationStrategy


class OptimizerAgent(BaseAgent):
    """Runs portfolio optimization using PyPortfolioOpt and skfolio."""

    def __init__(self) -> None:
        """Initialise the OptimizerAgent."""
        super().__init__("optimizer")

    async def _execute(self, request: AgentRequest) -> AgentResponse:
        """Execute the optimization workflow.

        Args:
            request: The structured request to process.

        Returns:
            An AgentResponse with optimization results.

        Raises:
            ValueError: If intent is not OPTIMIZE_PORTFOLIO.
        """
        if request.intent != AgentIntent.OPTIMIZE_PORTFOLIO:
            raise ValueError(f"Unsupported intent: {request.intent}")

        tickers = request.payload.get("tickers", [])
        new_cash = request.payload.get("new_cash", 0.0)
        current_portfolio = request.payload.get("current_portfolio", {})

        try:
            strategy = OptimizationStrategy(str(request.payload.get("strategy", "")))
        except ValueError:
            strategy = OptimizationStrategy.MAX_SHARPE

        if not tickers:
            return AgentResponse(
                intent=request.intent,
                success=False,
                result={},
                error="No tickers provided for optimization.",
            )

        optimizer = PortfolioOptimizer()
        try:
            result = optimizer.optimize(
                tickers=tickers,
                new_cash=new_cash,
                current_portfolio=current_portfolio,
                strategy=strategy,
            )
            return AgentResponse(
                intent=request.intent,
                success=True,
                result=result.model_dump(),
            )
        except Exception as e:
            return AgentResponse(
                intent=request.intent,
                success=False,
                result={},
                error=f"Optimization failed: {str(e)}",
            )
