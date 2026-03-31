"""CSV parser for portfolio upload files."""

import io
from datetime import UTC, date, datetime

import pandas as pd

from src.models.portfolio import Holding, Lot, Portfolio

# Column inference patterns (case-insensitive substring match)
_TICKER_PATTERNS = ("ticker", "symbol", "stock", "isin")
_SHARES_PATTERNS = ("shares", "quantity", "units", "qty", "amount")
_DATE_PATTERNS = ("date", "purchased", "acquisition", "opened")
_COST_PATTERNS = ("cost", "price", "basis", "avg", "average")


def _find_column(headers: list[str], patterns: tuple[str, ...]) -> str | None:
    """Return the first header that contains any of the given patterns.

    Args:
        headers: List of column header strings.
        patterns: Substrings to look for (case-insensitive).

    Returns:
        The matching header string, or None if no match is found.
    """
    for header in headers:
        lower = header.lower()
        if any(p in lower for p in patterns):
            return header
    return None


def parse_portfolio_csv(content: bytes) -> Portfolio:
    """Parse a CSV file of holdings into a Portfolio.

    Flexibly infers column mapping from header names.  Supports multiple
    lots of the same ticker.  The only required column is a ticker/symbol
    column; shares, date, and cost-basis columns are optional.

    Args:
        content: Raw bytes of the uploaded CSV file.

    Returns:
        A Portfolio built from the CSV rows.

    Raises:
        ValueError: If no ticker/symbol column can be identified.
    """
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    df = pd.read_csv(io.StringIO(text))
    headers: list[str] = list(df.columns)

    ticker_col = _find_column(headers, _TICKER_PATTERNS)
    if ticker_col is None:
        raise ValueError("Could not identify a ticker/symbol column")

    shares_col = _find_column(headers, _SHARES_PATTERNS)
    date_col = _find_column(headers, _DATE_PATTERNS)
    cost_col = _find_column(headers, _COST_PATTERNS)

    # Group lots by ticker
    holdings_map: dict[str, list[Lot]] = {}

    for _, row in df.iterrows():
        raw_ticker = row[ticker_col]
        if pd.isna(raw_ticker) or str(raw_ticker).strip() == "":
            continue
        ticker = str(raw_ticker).strip().upper()

        shares: float = 0.0
        if shares_col is not None and not pd.isna(row[shares_col]):
            shares = float(row[shares_col])

        purchase_date: date | None = None
        if date_col is not None and not pd.isna(row[date_col]):
            try:
                purchase_date = pd.to_datetime(row[date_col]).date()
            except (ValueError, TypeError):
                purchase_date = None

        cost_basis: float | None = None
        if cost_col is not None and not pd.isna(row[cost_col]):
            try:
                cost_basis = float(row[cost_col])
            except (ValueError, TypeError):
                cost_basis = None

        lot = Lot(
            ticker=ticker,
            shares=shares,
            purchase_date=purchase_date,
            cost_basis=cost_basis,
        )
        holdings_map.setdefault(ticker, []).append(lot)

    holdings = [
        Holding(ticker=ticker, lots=lots) for ticker, lots in holdings_map.items()
    ]

    return Portfolio(holdings=holdings, uploaded_at=datetime.now(UTC))
