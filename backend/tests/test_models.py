"""Tests for Pydantic models."""

from datetime import UTC, date, datetime

import pytest
from src.models.market import PriceBar, PriceHistory, TickerInfo
from src.models.optimizer import ConstraintSet
from src.models.portfolio import Holding, Lot, Portfolio


class TestLot:
    """Tests for the Lot model."""

    def test_minimal_lot(self) -> None:
        lot = Lot(ticker="AAPL", shares=10.0)
        assert lot.ticker == "AAPL"
        assert lot.shares == 10.0
        assert lot.purchase_date is None
        assert lot.cost_basis is None

    def test_full_lot(self) -> None:
        lot = Lot(
            ticker="MSFT",
            shares=5.0,
            purchase_date=date(2023, 1, 15),
            cost_basis=250.0,
        )
        assert lot.cost_basis == 250.0
        assert lot.purchase_date == date(2023, 1, 15)

    def test_invalid_shares_type(self) -> None:
        with pytest.raises(Exception):
            Lot(ticker="AAPL", shares="not-a-number")  # type: ignore[arg-type]


class TestHolding:
    """Tests for the Holding model."""

    def test_total_shares_computed(self) -> None:
        lots = [
            Lot(ticker="AAPL", shares=10.0),
            Lot(ticker="AAPL", shares=5.0),
        ]
        holding = Holding(ticker="AAPL", lots=lots)
        assert holding.total_shares == 15.0

    def test_total_cost_computed(self) -> None:
        lots = [
            Lot(ticker="AAPL", shares=10.0, cost_basis=100.0),
            Lot(ticker="AAPL", shares=5.0, cost_basis=120.0),
        ]
        holding = Holding(ticker="AAPL", lots=lots)
        assert holding.total_cost == 10.0 * 100.0 + 5.0 * 120.0

    def test_total_cost_none_when_any_lot_missing_cost(self) -> None:
        lots = [
            Lot(ticker="AAPL", shares=10.0, cost_basis=100.0),
            Lot(ticker="AAPL", shares=5.0),  # no cost_basis
        ]
        holding = Holding(ticker="AAPL", lots=lots)
        assert holding.total_cost is None

    def test_total_cost_none_when_all_lots_missing_cost(self) -> None:
        lots = [Lot(ticker="AAPL", shares=10.0)]
        holding = Holding(ticker="AAPL", lots=lots)
        assert holding.total_cost is None

    def test_single_lot_totals(self) -> None:
        lots = [Lot(ticker="TSLA", shares=3.0, cost_basis=200.0)]
        holding = Holding(ticker="TSLA", lots=lots)
        assert holding.total_shares == 3.0
        assert holding.total_cost == 600.0

    def test_invalid_lots_type(self) -> None:
        with pytest.raises(Exception):
            Holding(ticker="AAPL", lots="not-a-list")  # type: ignore[arg-type]


class TestPortfolio:
    """Tests for the Portfolio model."""

    def test_portfolio_construction(self) -> None:
        lots = [Lot(ticker="AAPL", shares=10.0)]
        holding = Holding(ticker="AAPL", lots=lots)
        now = datetime.now(UTC)
        portfolio = Portfolio(holdings=[holding], uploaded_at=now)
        assert len(portfolio.holdings) == 1
        assert portfolio.uploaded_at == now


class TestPriceBar:
    """Tests for the PriceBar model."""

    def test_price_bar_construction(self) -> None:
        bar = PriceBar(
            date=date(2024, 1, 2),
            open=185.0,
            high=188.0,
            low=184.0,
            close=187.0,
            volume=50_000_000,
        )
        assert bar.close == 187.0
        assert bar.volume == 50_000_000

    def test_invalid_volume_type(self) -> None:
        with pytest.raises(Exception):
            PriceBar(
                date=date(2024, 1, 2),
                open=185.0,
                high=188.0,
                low=184.0,
                close=187.0,
                volume="a lot",  # type: ignore[arg-type]
            )


class TestTickerInfo:
    """Tests for the TickerInfo model."""

    def test_all_optional_fields_default_none(self) -> None:
        info = TickerInfo(ticker="AAPL")
        assert info.name is None
        assert info.sector is None
        assert info.current_price is None

    def test_full_ticker_info(self) -> None:
        info = TickerInfo(
            ticker="AAPL",
            name="Apple Inc.",
            sector="Technology",
            industry="Consumer Electronics",
            market_cap=3e12,
            pe_ratio=28.5,
            dividend_yield=0.005,
            week_52_high=199.0,
            week_52_low=124.0,
            current_price=185.0,
            currency="USD",
            exchange="NMS",
            description="Apple Inc. designs consumer electronics.",
        )
        assert info.name == "Apple Inc."
        assert info.market_cap == 3e12


class TestPriceHistory:
    """Tests for the PriceHistory model."""

    def test_price_history_construction(self) -> None:
        bars = [
            PriceBar(
                date=date(2024, 1, 2),
                open=185.0,
                high=188.0,
                low=184.0,
                close=187.0,
                volume=1_000_000,
            )
        ]
        history = PriceHistory(
            ticker="AAPL",
            bars=bars,
            start_date=date(2024, 1, 1),
            end_date=date(2024, 1, 31),
        )
        assert history.ticker == "AAPL"
        assert len(history.bars) == 1


class TestConstraintSet:
    """Tests for ConstraintSet (v2.0.0 fields: max_shares, no_sell_tickers)."""

    def test_all_fields_default_to_empty(self) -> None:
        cs = ConstraintSet()
        assert cs.max_weights == {}
        assert cs.min_weights == {}
        assert cs.min_shares == {}
        assert cs.max_shares == {}
        assert cs.no_sell_tickers == []
        assert cs.portfolio_reduction_target is None

    def test_max_shares_can_be_populated(self) -> None:
        cs = ConstraintSet(max_shares={"AAPL": 50.0, "MSFT": 100.0})
        assert cs.max_shares["AAPL"] == 50.0
        assert cs.max_shares["MSFT"] == 100.0

    def test_no_sell_tickers_accepts_list_of_strings(self) -> None:
        cs = ConstraintSet(no_sell_tickers=["AAPL", "MSFT", "GOOG"])
        assert cs.no_sell_tickers == ["AAPL", "MSFT", "GOOG"]

    def test_no_sell_tickers_and_max_shares_coexist(self) -> None:
        cs = ConstraintSet(
            no_sell_tickers=["AAPL"],
            max_shares={"AAPL": 30.0},
        )
        assert "AAPL" in cs.no_sell_tickers
        assert cs.max_shares["AAPL"] == 30.0

    def test_model_copy_deep_does_not_mutate_original(self) -> None:
        cs = ConstraintSet(no_sell_tickers=["AAPL"])
        copy = cs.model_copy(deep=True)
        copy.min_shares["AAPL"] = 10.0
        assert "AAPL" not in cs.min_shares

    def test_invalid_max_shares_type_raises(self) -> None:
        with pytest.raises(Exception):
            ConstraintSet(max_shares="not-a-dict")  # type: ignore[arg-type]
