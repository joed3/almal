from datetime import date
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class OptimizationStrategy(StrEnum):
    """The risk/return strategy to use for portfolio optimization."""

    MIN_VOLATILITY = "min_volatility"
    MAX_SHARPE = "max_sharpe"
    MAX_RETURN = "max_return"
    REGULARIZED_SHARPE = "regularized_sharpe"
    # skfolio-based strategies
    RISK_PARITY = "risk_parity"
    CVAR = "cvar"
    HRP = "hrp"
    BLACK_LITTERMAN = "black_litterman"


class BLView(BaseModel):
    """A single Black-Litterman view expressing an expected return for one ticker."""

    ticker: str
    expected_return: float = Field(
        ..., description="Expected annual return as a decimal (e.g. 0.10 for 10%)."
    )
    confidence: Literal["low", "medium", "high"] = "medium"


class AdvancedParams(BaseModel):
    """Optional advanced parameters for fine-tuning an optimization run."""

    risk_free_rate: float | None = Field(
        default=None,
        ge=0,
        description="Annual risk-free rate override (e.g. 0.04 for 4%).",
    )
    cvar_beta: float | None = Field(
        default=None,
        ge=0.5,
        le=0.999,
        description="CVaR confidence level (default 0.95).",
    )
    hrp_linkage: str | None = Field(
        default=None,
        description="Linkage method for HRP clustering: 'single', 'ward', 'complete'.",
    )
    bl_tau: float | None = Field(
        default=None,
        gt=0,
        description="Black-Litterman tau scaling parameter (default 0.05).",
    )
    bl_market_proxy: str | None = Field(
        default=None,
        description="Ticker for BL market proxy equilibrium returns (default 'SPY').",
    )


class LotData(BaseModel):
    """Lot-level purchase data for a single position, used for tax computation."""

    ticker: str
    shares: float
    purchase_date: date | None = None
    cost_basis: float | None = None


class ConstraintSet(BaseModel):
    """Structured portfolio constraints parsed from natural language."""

    max_weights: dict[str, float] = Field(
        default_factory=dict,
        description="Maximum weight per ticker (e.g. {'AAPL': 0.15}).",
    )
    min_weights: dict[str, float] = Field(
        default_factory=dict,
        description="Minimum weight per ticker.",
    )
    min_shares: dict[str, float] = Field(
        default_factory=dict,
        description="Minimum shares to hold per ticker.",
    )
    portfolio_reduction_target: float | None = Field(
        default=None,
        ge=0,
        description="Target dollar reduction in total portfolio value.",
    )
    tax_aware: bool = Field(
        default=False,
        description="Whether to apply a tax-efficiency penalty to the objective.",
    )
    tax_aware_weight: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description=(
            "Strength of the tax penalty: 0 = ignore, "
            "1 = strongly prefer tax efficiency."
        ),
    )


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
    lookback_years: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Years of historical price data to use for estimation.",
    )
    advanced_params: AdvancedParams | None = Field(
        default=None,
        description="Optional advanced parameter overrides.",
    )
    views: list[BLView] = Field(
        default_factory=list,
        description="Black-Litterman views (only used when strategy=black_litterman).",
    )
    constraints: ConstraintSet | None = Field(
        default=None,
        description="Optional parsed portfolio constraints.",
    )
    lots: list[LotData] = Field(
        default_factory=list,
        description="Lot-level purchase data used for tax-aware optimization.",
    )


class AllocationRequirement(BaseModel):
    """The ideal allocation and trade delta for a specific ticker."""

    ticker: str
    weight: float
    current_shares: float
    target_shares: float
    shares_delta: float
    target_dollars: float
    est_tax_impact: float | None = None
    holding_days: int | None = None


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
    """Request payload for the walk-forward backtest endpoint."""

    tickers: list[str] = Field(..., min_length=1)
    strategy: OptimizationStrategy = Field(
        default=OptimizationStrategy.MAX_SHARPE,
        description="Optimization strategy to use at each rebalance.",
    )
    cadence: Literal["monthly", "quarterly", "annual", "buy_and_hold"] = Field(
        default="quarterly",
        description="How often to re-optimize the portfolio.",
    )
    benchmark: str = Field(default="SPY", description="Benchmark ticker symbol.")
    lookback_years: int = Field(default=3, ge=1, le=10)
    advanced_params: AdvancedParams | None = Field(default=None)
    views: list[BLView] = Field(default_factory=list)


class BacktestStats(BaseModel):
    """Summary statistics for a backtest or benchmark series."""

    total_return: float
    annualized_return: float
    annual_volatility: float
    sharpe_ratio: float
    max_drawdown: float
    calmar_ratio: float


class BacktestResult(BaseModel):
    """The structured result of a walk-forward backtest simulation."""

    dates: list[str]
    portfolio_cumulative: list[float]
    benchmark_cumulative: list[float]
    benchmark: str
    lookback_years: int
    rebalance_dates: list[str]
    rebalance_cadence: str
    strategy_used: str
    stats: BacktestStats
    benchmark_stats: BacktestStats
    bah_cumulative: list[float] | None = None
    bah_stats: BacktestStats | None = None


class ParseConstraintsRequest(BaseModel):
    """Request payload for the constraint parser endpoint."""

    text: str = Field(..., description="Free-text natural language constraint input.")
    tickers: list[str] = Field(default_factory=list)
    lots: list[LotData] = Field(default_factory=list)


class ParseConstraintsResponse(BaseModel):
    """Response from the constraint parser endpoint."""

    constraints: ConstraintSet
    chips: list[str] = Field(
        description="Human-readable labels for each parsed constraint."
    )
    clarification_needed: str | None = Field(
        default=None,
        description="A clarifying question if the input was ambiguous.",
    )
