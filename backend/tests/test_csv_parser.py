"""Tests for parse_portfolio_csv."""

import pytest
from src.data.csv_parser import parse_portfolio_csv
from src.models.portfolio import Portfolio


def _csv(text: str) -> bytes:
    return text.strip().encode("utf-8")


class TestSimpleParsing:
    """Basic CSV parsing tests."""

    def test_simple_ticker_and_shares(self) -> None:
        content = _csv(
            """
ticker,shares
AAPL,10
MSFT,5
"""
        )
        portfolio = parse_portfolio_csv(content)
        assert isinstance(portfolio, Portfolio)
        tickers = {h.ticker for h in portfolio.holdings}
        assert tickers == {"AAPL", "MSFT"}

    def test_shares_summed_correctly(self) -> None:
        content = _csv(
            """
ticker,shares
AAPL,10
"""
        )
        portfolio = parse_portfolio_csv(content)
        holding = portfolio.holdings[0]
        assert holding.total_shares == 10.0

    def test_ticker_normalised_to_uppercase(self) -> None:
        content = _csv(
            """
ticker,shares
aapl,10
"""
        )
        portfolio = parse_portfolio_csv(content)
        assert portfolio.holdings[0].ticker == "AAPL"

    def test_empty_ticker_rows_skipped(self) -> None:
        content = _csv(
            """
ticker,shares
AAPL,10
,5
   ,3
"""
        )
        portfolio = parse_portfolio_csv(content)
        assert len(portfolio.holdings) == 1
        assert portfolio.holdings[0].ticker == "AAPL"


class TestMultipleLots:
    """Tests for grouping multiple rows with the same ticker."""

    def test_multiple_lots_grouped_into_one_holding(self) -> None:
        content = _csv(
            """
ticker,shares
AAPL,10
AAPL,5
MSFT,20
"""
        )
        portfolio = parse_portfolio_csv(content)
        aapl = next(h for h in portfolio.holdings if h.ticker == "AAPL")
        assert len(aapl.lots) == 2
        assert aapl.total_shares == 15.0

    def test_total_cost_computed_across_lots(self) -> None:
        content = _csv(
            """
ticker,shares,cost
AAPL,10,100.0
AAPL,5,120.0
"""
        )
        portfolio = parse_portfolio_csv(content)
        aapl = portfolio.holdings[0]
        assert aapl.total_cost == 10 * 100.0 + 5 * 120.0


class TestOptionalColumns:
    """Tests for CSV files with optional columns."""

    def test_all_optional_columns_parsed(self) -> None:
        content = _csv(
            """
ticker,shares,date,cost basis
AAPL,10,2023-01-15,150.0
"""
        )
        portfolio = parse_portfolio_csv(content)
        lot = portfolio.holdings[0].lots[0]
        assert lot.purchase_date is not None
        assert lot.cost_basis == 150.0

    def test_missing_cost_basis_results_in_none(self) -> None:
        content = _csv(
            """
ticker,shares
AAPL,10
"""
        )
        portfolio = parse_portfolio_csv(content)
        assert portfolio.holdings[0].total_cost is None

    def test_partial_cost_basis_results_in_none_total(self) -> None:
        content = _csv(
            """
ticker,shares,cost
AAPL,10,100.0
AAPL,5,
"""
        )
        portfolio = parse_portfolio_csv(content)
        aapl = portfolio.holdings[0]
        assert aapl.total_cost is None


class TestColumnInference:
    """Tests for flexible column name inference."""

    def test_symbol_column_name(self) -> None:
        content = _csv(
            """
Symbol,Qty
AAPL,10
"""
        )
        portfolio = parse_portfolio_csv(content)
        assert portfolio.holdings[0].ticker == "AAPL"

    def test_qty_column_name(self) -> None:
        content = _csv(
            """
Symbol,Qty
AAPL,7
"""
        )
        portfolio = parse_portfolio_csv(content)
        assert portfolio.holdings[0].total_shares == 7.0

    def test_avg_price_column_name(self) -> None:
        content = _csv(
            """
Symbol,Qty,Avg Price
AAPL,10,155.0
"""
        )
        portfolio = parse_portfolio_csv(content)
        lot = portfolio.holdings[0].lots[0]
        assert lot.cost_basis == 155.0

    def test_unusual_column_names(self) -> None:
        content = _csv(
            """
Symbol,Qty,Avg Price,Date Purchased
MSFT,3,250.0,2022-06-01
"""
        )
        portfolio = parse_portfolio_csv(content)
        holding = portfolio.holdings[0]
        assert holding.ticker == "MSFT"
        assert holding.total_shares == 3.0
        lot = holding.lots[0]
        assert lot.cost_basis == 250.0
        assert lot.purchase_date is not None


class TestErrorHandling:
    """Tests for error conditions."""

    def test_missing_ticker_column_raises_value_error(self) -> None:
        content = _csv(
            """
quantity,price
10,100.0
"""
        )
        with pytest.raises(ValueError, match="ticker"):
            parse_portfolio_csv(content)

    def test_latin1_encoding_decoded(self) -> None:
        text = "ticker,shares\nAAPL,10\n"
        content = text.encode("latin-1")
        portfolio = parse_portfolio_csv(content)
        assert portfolio.holdings[0].ticker == "AAPL"
