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


def test_old_gold_payload_accepts_gold_and_silver_only():
    from pydantic import ValidationError
    from app.api.v1.integrations import BridgeCustomer, BridgeOldGoldPurchase, _old_metal_material_code

    base = dict(
        external_ref="EX-2026-00001", purchase_date="2026-09-24",
        customer=BridgeCustomer(name="A Customer", phone="9999999999"),
        purity="0.916", gross_weight="12.5", net_weight="12.3",
        rate_per_gram="6100", value="68000", description="22K bangle",
    )
    gold = BridgeOldGoldPurchase(metal="GOLD", **base)
    assert _old_metal_material_code(gold.metal) == settings.ECOMMERCE_OLD_GOLD_MATERIAL_CODE
    silver = BridgeOldGoldPurchase(metal="SILVER", **base)
    assert _old_metal_material_code(silver.metal) == settings.ECOMMERCE_OLD_SILVER_MATERIAL_CODE
    with pytest.raises(ValidationError):
        BridgeOldGoldPurchase(metal="PLATINUM", **base)
    # Purity is a fraction, never millesimal 916.
    with pytest.raises(ValidationError):
        BridgeOldGoldPurchase(metal="GOLD", **{**base, "purity": "916"})


def test_exchange_credit_rides_on_the_sale_payload():
    from app.api.v1.integrations import BridgeCustomer, BridgeExchangeCredit, BridgeSaleRequest

    sale = BridgeSaleRequest(
        external_ref="ORD-1", invoice_no="WEB/2026-27/00001", invoice_date="2026-09-24",
        customer=BridgeCustomer(name="A"), lines=[line("10000")],
        totals=BridgeTotals(taxable="10000", cgst="150", sgst="150", grand_total="10300"),
        payment=None,
        exchange_credit=BridgeExchangeCredit(amount="10300", reference="EX-2026-00001", purchase_ref="PI/2026-27/00007"),
    )
    assert sale.payment is None
    assert sale.exchange_credit.amount == Decimal("10300")
    assert sale.lines[0].material_code is None


def test_advance_and_advance_applied_models():
    from app.api.v1.integrations import BridgeAdvance, BridgeAdvanceApplied, BridgeCustomer, BridgeCreditNoteRequest

    adv = BridgeAdvance(external_ref="TRS-abc-3", customer=BridgeCustomer(name="A"), amount="5000", date="2026-09-25",
                        scheme="Treasure plan TC-0001")
    assert adv.mode == "Razorpay" and adv.amount == Decimal("5000")
    applied = BridgeAdvanceApplied(amount="5000", reference="TRS-abc")
    assert not hasattr(applied, "purchase_ref")
    cn = BridgeCreditNoteRequest(external_ref="ORD-1", invoice_no="WEB/2026-27/00001", amount="10300",
                                 reason="Refund", date="2026-09-25", refund_paid="0")
    assert cn.refund_paid == Decimal("0")
    assert BridgeCreditNoteRequest(external_ref="ORD-1", invoice_no="WEB/1", amount="1", reason="r", date="2026-09-25").refund_paid is None


# ─── Repair service invoices ─────────────────────────────────────────────────

def service_line(value="1000", rate="18", sac="998722"):
    return BridgeLine(description="Service - Resizing (job RJ-2026-00042)", hsn_sac_code=sac,
                      taxable_value=Decimal(value), gst_rate=Decimal(rate), is_service=True)


def test_a_service_line_is_taxed_at_its_own_rate_through_the_making_leg():
    exp = expected_totals([service_line()], Decimal("0"), "08", "08")
    assert exp["taxable"] == Decimal("1000.00")
    assert exp["cgst"] == Decimal("90.00") and exp["sgst"] == Decimal("90.00") and exp["igst"] == Decimal("0.00")
    assert exp["grand_total"] == Decimal("1180.00")

    inter = expected_totals([service_line()], Decimal("0"), "08", "27")
    assert inter["igst"] == Decimal("180.00") and inter["cgst"] == Decimal("0.00")


def test_service_and_goods_lines_add_up_together():
    exp = expected_totals([line("10000", "3", "7113"), service_line()], Decimal("50"), "08", "08")
    assert exp["taxable"] == Decimal("11000.00")
    assert exp["cgst"] == Decimal("240.00") and exp["sgst"] == Decimal("240.00")
    assert exp["grand_total"] == Decimal("11530.00")


def test_service_line_becomes_a_making_only_invoice_line():
    from app.api.v1.integrations import line_request

    req = line_request(service_line(), Decimal("0"))
    assert req.material_id is None
    assert req.material_value == Decimal("0")
    assert req.making_charges == Decimal("1000")
    assert req.making_gst_rate == Decimal("18")
    assert req.material_gst_rate == Decimal("18")
    assert req.hsn_sac_code == "998722"
    assert req.description == "Service - Resizing (job RJ-2026-00042)"

    goods = line_request(
        BridgeLine(description="Ring", sku="JW-1", material_code="FG-RING-1", hsn_sac_code="7113",
                   taxable_value=Decimal("10000"), gst_rate=Decimal("3")),
        Decimal("50"),
    )
    assert goods.material_id == "FG-RING-1", "an item-master code is accepted, not only a UUID"
    assert goods.material_value == Decimal("10000") and goods.making_charges == Decimal("0")
    assert goods.making_gst_rate is None
    assert goods.other_charges == Decimal("50")
    assert goods.description == "Ring [JW-1]"


def test_is_service_defaults_off_so_existing_web_orders_are_unchanged():
    assert BridgeLine(description="x", hsn_sac_code="7113", taxable_value=Decimal("1"), gst_rate=Decimal("3")).is_service is False


def test_the_pre_check_and_the_posting_agree_on_a_service_invoice():
    """The 409 pre-check must compute a service line exactly as the sales
    module will book it: zero material, the value on the making leg."""
    from app.api.v1.integrations import line_request
    from app.tax.gst_engine import calculate_jewelry_gst

    ln = service_line("1500", "18")
    req = line_request(ln, Decimal("0"))
    booked = calculate_jewelry_gst(
        material_value=req.material_value, making_charges=req.making_charges,
        seller_state_code="08", buyer_state_code="08",
        material_gst_rate=req.material_gst_rate, making_gst_rate=req.making_gst_rate,
    )
    exp = expected_totals([ln], Decimal("0"), "08", "08")
    assert exp["cgst"] == booked.cgst_making and exp["sgst"] == booked.sgst_making
    assert booked.cgst_material == 0
