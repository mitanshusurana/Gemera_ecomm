"""Job work rules under CGST s.143.

The deadline maths has real consequence: miss it and the original dispatch is
retrospectively a supply made on the day it left, so tax and interest run from
then, not from the day the deadline passed.
"""

from datetime import date
from decimal import Decimal

import pytest

from app.tax.job_work import (
    CAPITAL_GOODS_RETURN_YEARS,
    GOODS_TYPE_CAPITAL,
    GOODS_TYPE_INPUT,
    INPUT_RETURN_YEARS,
    days_remaining,
    is_overdue,
    job_work_tax,
    net_of_wastage,
    return_due_date,
    wastage_pct,
)


def test_inputs_must_return_within_one_year():
    assert INPUT_RETURN_YEARS == 1
    assert return_due_date(date(2026, 3, 15), GOODS_TYPE_INPUT) == date(2027, 3, 15)


def test_capital_goods_have_three_years():
    assert CAPITAL_GOODS_RETURN_YEARS == 3
    assert return_due_date(date(2026, 3, 15), GOODS_TYPE_CAPITAL) == date(2029, 3, 15)


def test_unknown_goods_type_uses_the_shorter_window():
    """Defaulting to three years would understate the liability."""
    assert return_due_date(date(2026, 3, 15), "Something") == date(2027, 3, 15)


def test_leap_day_dispatch_does_not_crash_or_slip():
    """29 Feb 2028 + 1 year has no 29 Feb; it must land in February, not March."""
    due = return_due_date(date(2028, 2, 29), GOODS_TYPE_INPUT)
    assert due == date(2029, 2, 28)


def test_the_due_date_itself_is_still_in_time():
    due = date(2027, 3, 15)
    assert is_overdue(due, as_of=date(2027, 3, 15)) is False
    assert is_overdue(due, as_of=date(2027, 3, 16)) is True


def test_days_remaining_goes_negative_once_overdue():
    due = date(2027, 3, 15)
    assert days_remaining(due, as_of=date(2027, 3, 10)) == 5
    assert days_remaining(due, as_of=date(2027, 3, 20)) == -5


# ─── Tax on making charges ───────────────────────────────────────────────────

def test_intra_state_job_work_splits_cgst_sgst():
    t = job_work_tax(Decimal("10000"), "08", "08")

    assert t.igst == Decimal("0.00")
    assert t.cgst + t.sgst == Decimal("500.00")  # 5% of 10,000
    assert t.total == Decimal("500.00")


def test_inter_state_job_work_is_igst():
    t = job_work_tax(Decimal("10000"), "08", "27")

    assert t.cgst == Decimal("0.00")
    assert t.igst == Decimal("500.00")


def test_unpadded_state_code_is_not_inter_state():
    """'8' and '08' are Rajasthan; a raw compare charged IGST."""
    t = job_work_tax(Decimal("10000"), "08", "8")

    assert t.igst == Decimal("0.00")
    assert t.cgst + t.sgst == Decimal("500.00")


def test_unregistered_karigar_charges_no_tax():
    """They cannot collect GST. Whether reverse charge applies to the
    principal is a separate determination, deliberately not assumed here."""
    t = job_work_tax(Decimal("10000"), "08", "08", job_worker_registered=False)

    assert t.total == Decimal("0.00")
    assert t.taxable_value == Decimal("10000.00")


def test_halves_always_re_sum_to_the_total():
    for charges in ("333.33", "1.01", "9999.99", "7777.77"):
        t = job_work_tax(Decimal(charges), "08", "08")
        assert t.cgst + t.sgst == t.total, charges


def test_zero_charges_yield_zero_tax():
    assert job_work_tax(Decimal("0"), "08", "08").total == Decimal("0.00")


def test_amounts_are_decimal():
    t = job_work_tax(Decimal("10000"), "08", "08")
    for v in (t.cgst, t.sgst, t.igst, t.total, t.taxable_value):
        assert isinstance(v, Decimal)


# ─── Reconciling what came back ──────────────────────────────────────────────

def test_fully_returned_leaves_nothing_outstanding():
    assert net_of_wastage(Decimal("100"), Decimal("100"), Decimal("0")) == Decimal("0")


def test_wastage_counts_as_accounted_for():
    """Metal lost in melting is normal; treating it as outstanding would leave
    every challan permanently open."""
    assert net_of_wastage(Decimal("100"), Decimal("98"), Decimal("2")) == Decimal("0")


def test_partial_return_leaves_a_balance():
    assert net_of_wastage(Decimal("100"), Decimal("60"), Decimal("1")) == Decimal("39")


def test_over_return_is_negative_and_therefore_visible():
    """More back than went out is a data error, not something to clamp to zero."""
    assert net_of_wastage(Decimal("100"), Decimal("105"), Decimal("0")) == Decimal("-5")


def test_wastage_percentage():
    assert wastage_pct(Decimal("100"), Decimal("2")) == Decimal("2.00")
    assert wastage_pct(Decimal("0"), Decimal("0")) == Decimal("0")


@pytest.mark.parametrize("goods_type", [GOODS_TYPE_INPUT, GOODS_TYPE_CAPITAL])
def test_due_date_is_always_after_dispatch(goods_type):
    """The DB CHECK asserts the same thing; they must not disagree."""
    d = date(2026, 6, 1)
    assert return_due_date(d, goods_type) > d
