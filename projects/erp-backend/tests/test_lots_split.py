"""Gemstone lot arithmetic: a split cannot create carats, loses only within
tolerance, and a merge averages cost by weight."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.api.v1.lots import child_lot_no, merged_cost_per_carat, split_loss


def test_exact_split_has_no_loss():
    assert split_loss(Decimal("12.400"), [Decimal("5.000"), Decimal("7.400")]) == Decimal("0.000")


def test_small_shortfall_is_the_loss():
    # 0.01 ct within the absolute tolerance.
    assert split_loss("12.40", ["5.00", "7.39"]) == Decimal("0.010")


def test_percentage_tolerance_scales_with_the_parent():
    # 0.5% of 100 ct is 0.5 ct.
    assert split_loss(100, [60, 39.5]) == Decimal("0.500")
    with pytest.raises(ValueError):
        split_loss(100, [60, 39.4])


def test_children_cannot_outweigh_the_parent():
    with pytest.raises(ValueError):
        split_loss("12.40", ["5.00", "7.41"])


def test_every_child_must_be_positive():
    with pytest.raises(ValueError):
        split_loss(10, [10, 0])
    with pytest.raises(ValueError):
        split_loss(10, [])


def test_shortfall_beyond_tolerance_is_refused():
    with pytest.raises(ValueError) as exc:
        split_loss("12.40", ["5.00", "7.00"])
    assert "adjust" in str(exc.value)


def test_merged_cost_is_weighted_by_carats():
    cpc = merged_cost_per_carat([(Decimal("10"), Decimal("8000")), (Decimal("30"), Decimal("12000"))])
    # (80,000 + 360,000) / 40
    assert cpc == Decimal("11000.00")


def test_merged_cost_ignores_missing_costs_but_counts_their_carats():
    assert merged_cost_per_carat([(10, 8000), (10, None)]) == Decimal("4000.00")
    assert merged_cost_per_carat([(10, None), (10, None)]) is None


def test_child_lot_numbers_follow_the_parent():
    assert child_lot_no("LOT/2026-27/00007", 2) == "LOT/2026-27/00007-2"
