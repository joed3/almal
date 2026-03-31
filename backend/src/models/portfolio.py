"""Pydantic models for portfolio data."""

from datetime import date, datetime

from pydantic import BaseModel, model_validator


class Lot(BaseModel):
    """A single purchase lot of a security.

    Attributes:
        ticker: The ticker symbol of the security.
        shares: Number of shares in this lot.
        purchase_date: Date the lot was purchased, if known.
        cost_basis: Per-share cost basis, if known.
    """

    ticker: str
    shares: float
    purchase_date: date | None = None
    cost_basis: float | None = None


class Holding(BaseModel):
    """Aggregated position in a single security across multiple lots.

    Attributes:
        ticker: The ticker symbol of the security.
        lots: Individual purchase lots making up this holding.
        total_shares: Total shares across all lots (computed).
        total_cost: Total cost basis across all lots (None if any lot
            is missing cost_basis).
    """

    ticker: str
    lots: list[Lot]
    total_shares: float = 0.0
    total_cost: float | None = None

    @model_validator(mode="after")
    def compute_totals(self) -> "Holding":
        """Compute total_shares and total_cost from lots."""
        self.total_shares = sum(lot.shares for lot in self.lots)
        if all(lot.cost_basis is not None for lot in self.lots):
            self.total_cost = sum(
                lot.shares * lot.cost_basis  # type: ignore[operator, misc]
                for lot in self.lots
            )
        else:
            self.total_cost = None
        return self


class Portfolio(BaseModel):
    """A complete portfolio of holdings.

    Attributes:
        holdings: List of holdings in the portfolio.
        uploaded_at: Timestamp when the portfolio was uploaded.
    """

    holdings: list[Holding]
    uploaded_at: datetime
