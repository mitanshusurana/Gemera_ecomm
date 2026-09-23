"""Purchase tax computation.

Each case pins behaviour that the two inline float copies got wrong.
"""

from decimal import Decimal

import pytest

from app.tax.purchase_tax import PurchaseLineInput, compute_purchase_totals


def line(**kw):
    base = dict(quantity=Decimal("1"), net_weight=Decimal("0"), rate=Decimal("0"),
                making_charges=Decimal("0"), gst_rate=Decimal("3"))
    base.update(kw)
    return PurchaseLineInput(**base)


def test_registered_intra_state_splits_cgst_sgst():
    t = compute_purchase_totals(
        [line(quantity=Decimal("1"), rate=Decimal("100000"), gst_rate=Decimal("3"))],
        is_unregistered=False, is_rcm=False, is_inter_state=False,
    )
    assert t.total_igst == Decimal("0.00")
    assert t.total_cgst + t.total_sgst == Decimal("3000.00")
    assert t.grand_total == Decimal("103000.00")


def test_registered_inter_state_is_igst():
    t = compute_purchase_totals(
        [line(rate=Decimal("100000"), gst_rate=Decimal("3"))],
        is_unregistered=False, is_rcm=False, is_inter_state=True,
    )
    assert t.total_cgst == Decimal("0.00")
    assert t.total_igst == Decimal("3000.00")


def test_weight_based_lines_use_net_weight_times_rate():
    t = compute_purchase_totals(
        [line(quantity=Decimal("1"), net_weight=Decimal("10.500"),
              rate=Decimal("6000"), gst_rate=Decimal("3"))],
        is_unregistered=False, is_rcm=False, is_inter_state=False,
    )
    assert t.material_subtotal == Decimal("63000.00")


def test_making_charges_taxed_at_five_percent_not_the_material_rate():
    t = compute_purchase_totals(
        [line(rate=Decimal("0"), quantity=Decimal("0"),
              making_charges=Decimal("10000"), gst_rate=Decimal("3"))],
        is_unregistered=False, is_rcm=False, is_inter_state=False,
    )
    assert t.total_gst == Decimal("500.00")


def test_rcm_excludes_tax_from_the_payable():
    """Under reverse charge the tax goes to the government, not the supplier."""
    t = compute_purchase_totals(
        [line(rate=Decimal("100000"), gst_rate=Decimal("3"))],
        is_unregistered=True, is_rcm=True, is_inter_state=False,
    )
    assert t.rcm_applicable is True
    assert t.grand_total == Decimal("100000.00")
    assert t.total_rcm == Decimal("3000.00")
    assert t.total_gst == Decimal("0.00"), "forward-charge GST must be nil"


def test_rcm_flag_is_ignored_for_a_registered_supplier():
    """s.9(4) reverse charge applies to UNREGISTERED suppliers.

    Honouring the flag for a registered one dropped the tax from the payable
    while ITC debits were still posted, unbalancing the journal entry.
    """
    t = compute_purchase_totals(
        [line(rate=Decimal("100000"), gst_rate=Decimal("3"))],
        is_unregistered=False, is_rcm=True, is_inter_state=False,
    )
    assert t.rcm_applicable is False
    assert t.total_rcm == Decimal("0.00")
    assert t.grand_total == Decimal("103000.00"), "tax is payable to the supplier"


def test_unregistered_without_rcm_charges_no_tax_at_all():
    t = compute_purchase_totals(
        [line(rate=Decimal("50000"), gst_rate=Decimal("3"))],
        is_unregistered=True, is_rcm=False, is_inter_state=False,
    )
    assert t.total_gst == Decimal("0.00")
    assert t.total_rcm == Decimal("0.00")
    assert t.grand_total == Decimal("50000.00")


def test_cgst_and_sgst_always_re_sum_to_the_total():
    """Float halving produced non-representable paise and a mismatched pair."""
    for rate in ("333.33", "1.01", "99999.99", "7777.77"):
        t = compute_purchase_totals(
            [line(rate=Decimal(rate), gst_rate=Decimal("3"))],
            is_unregistered=False, is_rcm=False, is_inter_state=False,
        )
        assert t.total_cgst + t.total_sgst == t.total_gst, rate


def test_totals_are_decimal_and_two_places():
    t = compute_purchase_totals(
        [line(rate=Decimal("12345.67"), gst_rate=Decimal("3"))],
        is_unregistered=False, is_rcm=False, is_inter_state=False,
    )
    for name in ("material_subtotal", "total_gst", "grand_total", "total_cgst"):
        v = getattr(t, name)
        assert isinstance(v, Decimal), name
        assert -v.as_tuple().exponent <= 2, f"{name} has sub-paisa precision: {v}"


def test_float_inputs_are_coerced_without_binary_drift():
    """0.1 + 0.2 in float is 0.30000000000000004; three such lines must not drift."""
    class Raw:
        quantity, net_weight, rate, making_charges, gst_rate = 1, 0, 0.1, 0.2, 3

    t = compute_purchase_totals(
        [Raw(), Raw(), Raw()],
        is_unregistered=False, is_rcm=False, is_inter_state=False,
    )
    assert t.material_subtotal == Decimal("0.30")
    assert t.making_subtotal == Decimal("0.60")


def test_empty_invoice_is_all_zero():
    t = compute_purchase_totals(
        [], is_unregistered=False, is_rcm=False, is_inter_state=False
    )
    assert t.grand_total == Decimal("0.00")
    assert t.total_gst == Decimal("0.00")


def test_multi_line_totals_accumulate():
    t = compute_purchase_totals(
        [
            line(rate=Decimal("10000"), gst_rate=Decimal("3")),
            line(rate=Decimal("20000"), gst_rate=Decimal("3")),
            line(rate=Decimal("0"), making_charges=Decimal("5000")),
        ],
        is_unregistered=False, is_rcm=False, is_inter_state=False,
    )
    assert t.material_subtotal == Decimal("30000.00")
    assert t.making_subtotal == Decimal("5000.00")
    # 3% of 30000 = 900, 5% of 5000 = 250
    assert t.total_gst == Decimal("1150.00")
    assert t.grand_total == Decimal("36150.00")


@pytest.mark.parametrize("inter_state", [True, False])
def test_grand_total_is_subtotals_plus_payable_tax(inter_state):
    t = compute_purchase_totals(
        [line(rate=Decimal("15000"), making_charges=Decimal("2000"), gst_rate=Decimal("3"))],
        is_unregistered=False, is_rcm=False, is_inter_state=inter_state,
    )
    assert t.grand_total == t.material_subtotal + t.making_subtotal + t.total_gst
