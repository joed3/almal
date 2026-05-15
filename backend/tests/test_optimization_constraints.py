"""Unit tests for constraint resolution helpers (no network, no optimizer calls)."""

import pytest
from src.analysis.optimization import _build_weight_bounds, _resolve_no_sell_tickers
from src.models.optimizer import ConstraintSet

# ---------------------------------------------------------------------------
# _resolve_no_sell_tickers
# ---------------------------------------------------------------------------


class TestResolveNoSellTickers:
    def test_injects_current_shares_as_min_shares(self) -> None:
        cs = ConstraintSet(no_sell_tickers=["AAPL"])
        resolved = _resolve_no_sell_tickers(cs, {"AAPL": 50.0, "MSFT": 20.0})
        assert resolved.min_shares["AAPL"] == 50.0

    def test_does_not_overwrite_explicit_min_shares(self) -> None:
        cs = ConstraintSet(no_sell_tickers=["AAPL"], min_shares={"AAPL": 10.0})
        resolved = _resolve_no_sell_tickers(cs, {"AAPL": 50.0})
        # Explicit min_shares takes precedence; no_sell_tickers must not clobber it.
        assert resolved.min_shares["AAPL"] == 10.0

    def test_ignores_tickers_not_in_current_portfolio(self) -> None:
        cs = ConstraintSet(no_sell_tickers=["TSLA"])
        resolved = _resolve_no_sell_tickers(cs, {"AAPL": 50.0})
        assert "TSLA" not in resolved.min_shares

    def test_does_not_mutate_original_constraint_set(self) -> None:
        cs = ConstraintSet(no_sell_tickers=["AAPL"])
        _resolve_no_sell_tickers(cs, {"AAPL": 30.0})
        assert "AAPL" not in cs.min_shares

    def test_returns_same_object_when_no_sell_tickers_empty(self) -> None:
        cs = ConstraintSet()
        result = _resolve_no_sell_tickers(cs, {"AAPL": 50.0})
        assert result is cs  # no copy needed — same object returned

    def test_multiple_tickers_all_resolved(self) -> None:
        cs = ConstraintSet(no_sell_tickers=["AAPL", "MSFT"])
        resolved = _resolve_no_sell_tickers(
            cs, {"AAPL": 30.0, "MSFT": 15.0, "GOOG": 5.0}
        )
        assert resolved.min_shares["AAPL"] == 30.0
        assert resolved.min_shares["MSFT"] == 15.0
        assert "GOOG" not in resolved.min_shares

    def test_partial_overlap_between_no_sell_and_portfolio(self) -> None:
        cs = ConstraintSet(no_sell_tickers=["AAPL", "TSLA"])
        resolved = _resolve_no_sell_tickers(cs, {"AAPL": 20.0})
        assert resolved.min_shares["AAPL"] == 20.0
        assert "TSLA" not in resolved.min_shares


# ---------------------------------------------------------------------------
# _build_weight_bounds
# ---------------------------------------------------------------------------


class TestBuildWeightBounds:
    def test_default_bounds_when_no_constraints(self) -> None:
        cs = ConstraintSet()
        bounds = _build_weight_bounds(cs, ["AAPL"], {"AAPL": 100.0}, 1000.0)
        assert bounds["AAPL"] == (0.0, 1.0)

    def test_max_shares_tightens_upper_bound(self) -> None:
        # 5 shares × $100 / $1000 total = 0.5
        cs = ConstraintSet(max_shares={"AAPL": 5.0})
        bounds = _build_weight_bounds(cs, ["AAPL"], {"AAPL": 100.0}, 1000.0)
        assert bounds["AAPL"][1] == pytest.approx(0.5)

    def test_min_shares_raises_lower_bound(self) -> None:
        # 3 shares × $100 / $1000 total = 0.3
        cs = ConstraintSet(min_shares={"AAPL": 3.0})
        bounds = _build_weight_bounds(cs, ["AAPL"], {"AAPL": 100.0}, 1000.0)
        assert bounds["AAPL"][0] == pytest.approx(0.3)

    def test_zero_price_skips_share_constraints(self) -> None:
        cs = ConstraintSet(max_shares={"AAPL": 5.0}, min_shares={"AAPL": 2.0})
        bounds = _build_weight_bounds(cs, ["AAPL"], {"AAPL": 0.0}, 1000.0)
        assert bounds["AAPL"] == (0.0, 1.0)

    def test_max_shares_weight_capped_at_one(self) -> None:
        # Very large max_shares — implied weight > 1.0 must be clamped.
        cs = ConstraintSet(max_shares={"AAPL": 10_000.0})
        bounds = _build_weight_bounds(cs, ["AAPL"], {"AAPL": 100.0}, 1000.0)
        assert bounds["AAPL"][1] == pytest.approx(1.0)

    def test_max_weights_stricter_than_max_shares_wins(self) -> None:
        # max_weights=0.3, max_shares=10 at $100/$1000 → shares→1.0 → max_weights wins
        cs = ConstraintSet(max_weights={"AAPL": 0.3}, max_shares={"AAPL": 10.0})
        bounds = _build_weight_bounds(cs, ["AAPL"], {"AAPL": 100.0}, 1000.0)
        assert bounds["AAPL"][1] == pytest.approx(0.3)

    def test_min_weights_stricter_than_min_shares_wins(self) -> None:
        # min_weights=0.4, min_shares=1 at $100/$1000 → shares→0.1 → min_weights wins
        cs = ConstraintSet(min_weights={"AAPL": 0.4}, min_shares={"AAPL": 1.0})
        bounds = _build_weight_bounds(cs, ["AAPL"], {"AAPL": 100.0}, 1000.0)
        assert bounds["AAPL"][0] == pytest.approx(0.4)

    def test_min_shares_stricter_than_min_weights_wins(self) -> None:
        # min_weights=0.1, min_shares=5 at $100/$1000 → shares imply 0.5 → shares wins
        cs = ConstraintSet(min_weights={"AAPL": 0.1}, min_shares={"AAPL": 5.0})
        bounds = _build_weight_bounds(cs, ["AAPL"], {"AAPL": 100.0}, 1000.0)
        assert bounds["AAPL"][0] == pytest.approx(0.5)

    def test_multiple_tickers_each_get_independent_bounds(self) -> None:
        cs = ConstraintSet(
            max_shares={"AAPL": 5.0},
            min_shares={"MSFT": 2.0},
        )
        bounds = _build_weight_bounds(
            cs,
            ["AAPL", "MSFT"],
            {"AAPL": 100.0, "MSFT": 50.0},
            1000.0,
        )
        # AAPL: max_shares=5 × $100 / $1000 = 0.5
        assert bounds["AAPL"][1] == pytest.approx(0.5)
        assert bounds["AAPL"][0] == pytest.approx(0.0)
        # MSFT: min_shares=2 × $50 / $1000 = 0.1
        assert bounds["MSFT"][0] == pytest.approx(0.1)
        assert bounds["MSFT"][1] == pytest.approx(1.0)

    def test_ticker_without_price_entry_gets_default_bounds(self) -> None:
        cs = ConstraintSet(max_shares={"AAPL": 5.0})
        bounds = _build_weight_bounds(cs, ["AAPL"], {}, 1000.0)
        # No price available → share constraint skipped → default hi = 1.0
        assert bounds["AAPL"] == (0.0, 1.0)
