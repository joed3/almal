"""Pydantic models for market data."""

from datetime import date

from pydantic import BaseModel


class PriceBar(BaseModel):
    """A single OHLCV price bar for a security.

    Attributes:
        date: The date of the bar.
        open: Opening price.
        high: Highest price during the period.
        low: Lowest price during the period.
        close: Closing price.
        volume: Trading volume.
    """

    date: date
    open: float
    high: float
    low: float
    close: float
    volume: int


class PriceHistory(BaseModel):
    """Historical OHLCV price data for a ticker.

    Attributes:
        ticker: The ticker symbol.
        bars: List of price bars.
        start_date: Start of the date range.
        end_date: End of the date range.
    """

    ticker: str
    bars: list[PriceBar]
    start_date: date
    end_date: date


class TickerInfo(BaseModel):
    """Current quote and fundamental data for a ticker.

    Attributes:
        ticker: The ticker symbol.
        name: Company name.
        sector: Business sector.
        industry: Specific industry.
        market_cap: Market capitalisation in the security's currency.
        pe_ratio: Trailing price-to-earnings ratio.
        dividend_yield: Annual dividend yield as a decimal.
        week_52_high: 52-week high price.
        week_52_low: 52-week low price.
        current_price: Most recent price.
        currency: Currency code (e.g. "USD").
        exchange: Exchange the security trades on.
        description: Long business description.
    """

    ticker: str
    name: str | None = None
    sector: str | None = None
    industry: str | None = None
    market_cap: float | None = None
    pe_ratio: float | None = None
    dividend_yield: float | None = None
    week_52_high: float | None = None
    week_52_low: float | None = None
    current_price: float | None = None
    currency: str | None = None
    exchange: str | None = None
    description: str | None = None
