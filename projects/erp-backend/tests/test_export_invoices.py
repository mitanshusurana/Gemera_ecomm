"""Export invoices: zero-rating under LUT, IGST with payment, currency conversion,
and the request validation that keeps the two kinds and the currency honest."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.v1.sales import CreateSalesInvoiceRequest, InvoiceLineRequest
from app.tax.gst_engine import (
    EXPORT_PLACE_OF_SUPPLY,
    calculate_bill_of_supply,
    calculate_export_gst,
    to_inr,
)


def test_lut_export_charges_no_tax():
    r = calculate_export_gst(100000, 10000, "LUT_without_tax")
    assert r.total_gst == Decimal("0.00")
    assert r.total_igst == r.total_cgst == r.total_sgst == Decimal("0.00")
    assert r.is_inter_state is True
    assert r.grand_total == Decimal("110000")


def test_export_with_igst_is_igst_only_at_the_goods_rate():
    r = calculate_export_gst(100000, 10000, "With_IGST", material_gst_rate=Decimal("3"))
    assert r.total_cgst == Decimal("0.00")
    assert r.total_sgst == Decimal("0.00")
    assert r.igst_material == Decimal("3000.00")
    assert r.igst_making == Decimal("500.00")
    assert r.total_igst == Decimal("3500.00")
    assert r.is_inter_state is True


def test_export_with_igst_on_loose_stones_uses_quarter_percent():
    r = calculate_export_gst(Decimal("400000"), 0, "With_IGST", material_gst_rate=Decimal("0.25"))
    assert r.igst_material == Decimal("1000.00")


def test_unknown_export_type_is_refused():
    with pytest.raises(ValueError):
        calculate_export_gst(1, 1, "Free")


def test_bill_of_supply_has_no_gst():
    r = calculate_bill_of_supply(50000, 2000)
    assert r.total_gst == Decimal("0.00")
    assert r.making_gst_rate == Decimal("0.00")


def test_place_of_supply_for_exports_is_other_country():
    assert EXPORT_PLACE_OF_SUPPLY == "96"


def test_to_inr_rounds_to_the_paisa():
    assert to_inr(Decimal("1250.00"), Decimal("83.2575")) == Decimal("104071.88")
    assert to_inr(Decimal("100"), 1) == Decimal("100.00")
    with pytest.raises(ValueError):
        to_inr(1, 0)


def _lines():
    return [InvoiceLineRequest(material_value=Decimal("1000"), hsn_sac_code="71039100")]


def test_export_invoice_requires_export_type():
    with pytest.raises(ValidationError):
        CreateSalesInvoiceRequest(
            customer_id=uuid4(), invoice_date=date(2026, 9, 1), lines=_lines(),
            invoice_type="Export_Invoice",
        )


def test_export_type_only_on_export_invoice():
    with pytest.raises(ValidationError):
        CreateSalesInvoiceRequest(
            customer_id=uuid4(), invoice_date=date(2026, 9, 1), lines=_lines(),
            invoice_type="Tax_Invoice", export_type="With_IGST",
        )


def test_foreign_currency_requires_a_rate():
    with pytest.raises(ValidationError):
        CreateSalesInvoiceRequest(
            customer_id=uuid4(), invoice_date=date(2026, 9, 1), lines=_lines(),
            invoice_type="Export_Invoice", export_type="LUT_without_tax", currency="USD",
        )
    ok = CreateSalesInvoiceRequest(
        customer_id=uuid4(), invoice_date=date(2026, 9, 1), lines=_lines(),
        invoice_type="Export_Invoice", export_type="LUT_without_tax", currency="usd",
        exchange_rate=Decimal("83.25"), shipping_bill_no="1234567", port_code="INJAI4",
        buyer_country="US", lut_no="AD0803260001234",
    )
    assert ok.currency == "USD"
    assert ok.export_type == "LUT_without_tax"


def test_rupee_invoice_must_not_carry_a_rate():
    with pytest.raises(ValidationError):
        CreateSalesInvoiceRequest(
            customer_id=uuid4(), invoice_date=date(2026, 9, 1), lines=_lines(),
            currency="INR", exchange_rate=Decimal("2"),
        )


def test_default_is_a_rupee_tax_invoice():
    r = CreateSalesInvoiceRequest(customer_id=uuid4(), invoice_date=date(2026, 9, 1), lines=_lines())
    assert r.invoice_type == "Tax_Invoice"
    assert r.currency == "INR"
    assert r.exchange_rate == 1
    assert r.export_type is None
    assert r.pan is None


def test_pan_is_normalised_and_validated():
    r = CreateSalesInvoiceRequest(
        customer_id=uuid4(), invoice_date=date(2026, 9, 1), lines=_lines(), pan=" abcpe1234f ",
    )
    assert r.pan == "ABCPE1234F"
    with pytest.raises(ValidationError):
        CreateSalesInvoiceRequest(
            customer_id=uuid4(), invoice_date=date(2026, 9, 1), lines=_lines(), pan="NOTAPAN",
        )


def test_line_accepts_lot_id():
    lid = uuid4()
    ln = InvoiceLineRequest(material_value=Decimal("1"), lot_id=lid, quantity=Decimal("2.5"))
    assert ln.lot_id == lid


def test_gstr1_exp_helper_is_exported():
    from app.api.v1 import sales

    assert callable(sales.export_invoices_for_period)
