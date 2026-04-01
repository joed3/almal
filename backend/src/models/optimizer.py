from enum import StrEnum

from pydantic import BaseModel, Field


class OptimizationStrategy(StrEnum):
    """The risk/return strategy to use for portfolio optimization."""

    MIN_VOLATILITY = "min_volatility"
    MAX_SHARPE = "max_sharpe"
    MAX_RETURN = "max_return"
    REGULARIZED_SHARPE = "regularized_sharpe"


class OptimizeRequest(BaseModel):
    """Request payload for the optimize endpoint."""

    tickers: list[str] = Field(
        ..., min_length=2, description="List of candidate ticker symbols."
    )
    new_cash: float = Field(
        default=0.0, ge=0, description="Amount of new capital to add."
    )
    current_portfolio: dict[str, float] = Field(
        default_factory=dict,
        description="Optional current holdings map (ticker -> shares) to rebalance.",
    )
    strategy: OptimizationStrategy = Field(
        default=OptimizationStrategy.MAX_SHARPE,
        description="The mathematical strategy for optimization.",
    )


class AllocationRequirement(BaseModel):
    """The ideal allocation and trade delta for a specific ticker."""

    ticker: str
    weight: float
    current_shares: float
    target_shares: float
    shares_delta: float
    target_dollars: float


class OptimizationMetrics(BaseModel):
    """Expected performance metrics of the optimized portfolio."""

    expected_annual_return: float
    annual_volatility: float
    sharpe_ratio: float


class EfficientFrontierPoint(BaseModel):
    """A single portfolio coordinate on the efficient frontier curve."""

    volatility: float
    return_: float = Field(alias="return")
    weights: dict[str, float]


class OptimizeResult(BaseModel):
    """The structured result of an optimization run."""

    strategy: OptimizationStrategy
    allocations: list[AllocationRequirement]
    metrics: OptimizationMetrics
    frontier_curve: list[EfficientFrontierPoint]
    leftover_cash: float


class BacktestRequest(BaseModel):
    """Request payload for the backtest endpoint."""

    tickers: list[str] = Field(..., min_length=1)
    weights: dict[str, float] = Field(..., description="Optimized weights per ticker.")
    benchmark: str = Field(default="SPY", description="Benchmark ticker symbol.")
    lookback_years: int = Field(default=3, ge=1, le=10)


class BacktestStats(BaseModel):
    """Summary statistics for a backtest or benchmark series."""

    total_return: float
    annualized_return: float
    annual_volatility: float
    sharpe_ratio: float
    max_drawdown: float
    calmar_ratio: float


class BacktestResult(BaseModel):
    """The structured result of a historical backtest simulation."""

    dates: list[str]
    portfolio_cumulative: list[float]
    benchmark_cumulative: list[float]
    benchmark: str
    lookback_years: int
    stats: BacktestStats
    benchmark_stats: BacktestStats
