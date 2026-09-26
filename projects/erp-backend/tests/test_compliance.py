"""s.269ST cash receipt limit and Rule 114B PAN on sales."""

from __future__ import annotations

from decimal import Decimal

from app.tax.compliance import (
    CASH_RECEIPT_LIMIT_INR,
    PAN_REQUIRED_SALE_INR,
    cash_receipt_violation,
    pan_required_for_sale,
    pan_required_message,
)


def test_limits_are_two_lakh():
    assert CASH_RECEIPT_LIMIT_INR == Decimal("200000")
    assert PAN_REQUIRED_SALE_INR == Decimal("200000")


def test_cash_below_the_limit_is_fine():
    assert cash_receipt_violation(0, Decimal("199999.99")) is None
    assert cash_receipt_violation(Decimal("100000"), Decimal("99999")) is None


def test_exactly_two_lakh_is_refused():
    msg = cash_receipt_violation(0, Decimal("200000"))
    assert msg and "269ST" in msg


def test_aggregate_over_the_day_counts():
    msg = cash_receipt_violation(Decimal("150000"), Decimal("50000"))
    assert msg and "already received" in msg


def test_non_positive_receipt_is_never_a_violation():
    assert cash_receipt_violation(Decimal("500000"), 0) is None
    assert cash_receipt_violation(Decimal("500000"), -1) is None


def test_pan_not_needed_below_threshold():
    assert pan_required_for_sale(Decimal("199999.99"), None, None) is False


def test_pan_needed_at_threshold_without_identity():
    assert pan_required_for_sale(Decimal("200000"), None, None) is True
    assert pan_required_for_sale(Decimal("200000"), "", "Unregistered") is True


def test_pan_or_gstin_satisfies_the_rule():
    assert pan_required_for_sale(Decimal("500000"), "ABCPE1234F", None) is False
    assert pan_required_for_sale(Decimal("500000"), None, "08ABCPE1234F1Z5") is False


def test_message_names_the_rule():
    assert "114B" in pan_required_message(Decimal("250000"))
