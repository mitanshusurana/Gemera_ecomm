"""E-commerce bridge: the pure parts, without a database.

The bridge records storefront invoices under the shop's own number and
recomputes the tax before writing. These tests pin the two places that can
silently misbook money: the pre-check that refuses a disagreeing total, and
the apportioning of a refund over material, tax and untaxed charges.
"""

from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.api.v1.integrations import (
    BridgeLine,
    BridgeTotals,
    expected_totals,
    require_api_key,
    split_refund,
    totals_mismatch,
)
from app.core.config import settings


def line(value, rate="3.00", hsn="7113"):
    return BridgeLine(description="x", hsn_sac_code=hsn, taxable_value=Decimal(value), gst_rate=Decimal(rate))


def test_intra_state_splits_the_tax_into_cgst_and_sgst():
    exp = expected_totals([line("10000")], Decimal("50"), "08", "08")
    assert exp["cgst"] == Decimal("150.00")
    assert exp["sgst"] == Decimal("150.00")
    assert exp["igst"] == Decimal("0.00")
    assert exp["grand_total"] == Decimal("10350.00")


def test_inter_state_books_igst_only():
    exp = expected_totals([line("10000")], Decimal("0"), "08", "27")
    assert exp["igst"] == Decimal("300.00")
    assert exp["cgst"] == exp["sgst"] == Decimal("0.00")


def test_loose_stones_carry_their_own_quarter_percent():
    exp = expected_totals([line("40000", rate="0.25", hsn="7103")], Decimal("0"), "08", "08")
    assert exp["cgst"] + exp["sgst"] == Decimal("100.00")


def test_paise_rounding_differences_are_tolerated():
    exp = expected_totals([line("10000")], Decimal("50"), "08", "08")
    claimed = BridgeTotals(taxable="10000", cgst="150.01", sgst="149.99", igst="0", grand_total="10350.30")
    assert totals_mismatch(exp, claimed) == {}


def test_a_rate_disagreement_is_reported_field_by_field():
    exp = expected_totals([line("10000")], Decimal("0"), "08", "08")
    # The shop charged 5% where this ledger books 3%.
    claimed = BridgeTotals(taxable="10000", cgst="250", sgst="250", igst="0", grand_total="10500")
    diffs = totals_mismatch(exp, claimed)
    assert set(diffs) == {"cgst", "sgst", "grand_total"}
    assert diffs["cgst"] == {"erp": "150.00", "storefront": "250.00"}


def test_full_refund_reverses_exactly_what_was_invoiced():
    material, other, gst, total = split_refund(
        Decimal("10350"), Decimal("10350"), Decimal("10000"), Decimal("50"), "08", "08", Decimal("3.00")
    )
    assert material == Decimal("10000.00")
    assert other == Decimal("50.00")
    assert gst.total_gst == Decimal("300.00")
    assert total == Decimal("10350.00")


def test_partial_refund_keeps_the_invoice_proportions():
    material, other, gst, total = split_refund(
        Decimal("5175"), Decimal("10350"), Decimal("10000"), Decimal("50"), "08", "08", Decimal("3.00")
    )
    assert material == Decimal("5000.00")
    assert gst.total_gst == Decimal("150.00")
    assert other == Decimal("25.00")
    assert total == Decimal("5175.00")


def test_refund_cannot_exceed_the_invoice():
    with pytest.raises(ValueError):
        split_refund(Decimal("20000"), Decimal("10350"), Decimal("10000"), Decimal("50"), "08", "08", Decimal("3.00"))


@pytest.mark.asyncio
async def test_bridge_is_closed_when_no_key_is_configured(monkeypatch):
    monkeypatch.setattr(settings, "ECOMMERCE_API_KEY", "")
    with pytest.raises(HTTPException) as exc:
        await require_api_key(x_api_key="")
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_bridge_rejects_a_wrong_key(monkeypatch):
    monkeypatch.setattr(settings, "ECOMMERCE_API_KEY", "k" * 40)
    with pytest.raises(HTTPException) as exc:
        await require_api_key(x_api_key="not-it")
    assert exc.value.status_code == 401
    with pytest.raises(HTTPException):
        await require_api_key(x_api_key=None)


@pytest.mark.asyncio
async def test_bridge_admits_the_configured_key(monkeypatch):
    monkeypatch.setattr(settings, "ECOMMERCE_API_KEY", "k" * 40)
    assert await require_api_key(x_api_key="k" * 40) is None
