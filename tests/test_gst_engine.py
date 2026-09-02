"""GST computation for jewellery.

Gold jewellery material is taxed at 3% (HSN 7113) and making charges at 5%
(SAC 9988). Intra-state supply splits into CGST+SGST; inter-state is IGST.
"""

from decimal import Decimal

import pytest

from app.tax.gst_engine import calculate_jewelry_gst


def test_intra_state_splits_into_cgst_and_sgst():
    r = calculate_jewelry_gst(
        material_value=100000,
        making_charges=10000,
        seller_state_code="08",
        buyer_state_code="08",
    )

    assert r.total_igst == Decimal("0.00")
    # 3% of 100000 = 3000; 5% of 10000 = 500. Total 3500, split evenly.
    assert r.total_cgst + r.total_sgst == Decimal("3500.00")
    assert r.total_cgst == Decimal("1750.00")
    assert r.total_sgst == Decimal("1750.00")


def test_inter_state_is_igst_only():
    r = calculate_jewelry_gst(
        material_value=100000,
        making_charges=10000,
        seller_state_code="08",
        buyer_state_code="27",
    )

    assert r.total_cgst == Decimal("0.00")
    assert r.total_sgst == Decimal("0.00")
    assert r.total_igst == Decimal("3500.00")


def test_split_halves_always_re_sum_to_the_total():
    """An odd-paisa total must not lose or gain a paisa in the CGST/SGST split."""
    # 3% of 33333.33 = 999.9999 -> 1000.00, an odd number of paise to halve.
    for material in ("33333.33", "1.01", "777.77", "12345.67"):
        r = calculate_jewelry_gst(
            material_value=Decimal(material),
            making_charges=0,
            seller_state_code="08",
            buyer_state_code="08",
        )
        assert r.total_cgst + r.total_sgst == r.total_gst, material


def test_material_and_making_are_taxed_at_different_rates():
    """A single blended rate would be wrong: the two components differ."""
    material_only = calculate_jewelry_gst(
        material_value=10000, making_charges=0,
        seller_state_code="08", buyer_state_code="08",
    )
    making_only = calculate_jewelry_gst(
        material_value=0, making_charges=10000,
        seller_state_code="08", buyer_state_code="08",
    )

    assert material_only.total_gst == Decimal("300.00")   # 3%
    assert making_only.total_gst == Decimal("500.00")     # 5%
    assert material_only.total_gst != making_only.total_gst


def test_zero_value_yields_zero_tax():
    r = calculate_jewelry_gst(
        material_value=0, making_charges=0,
        seller_state_code="08", buyer_state_code="08",
    )
    assert r.total_gst == Decimal("0.00")


def test_results_are_decimal_not_float():
    """Money must never surface as a binary float."""
    r = calculate_jewelry_gst(
        material_value=100000, making_charges=10000,
        seller_state_code="08", buyer_state_code="08",
    )
    for field in ("total_cgst", "total_sgst", "total_igst", "total_gst"):
        assert isinstance(getattr(r, field), Decimal), field


def test_decimal_input_is_not_corrupted_by_float_conversion():
    """A third of 100000 is exact in Decimal and lossy in float.

    The sales path computes a discounted taxable value in Decimal, then casts
    it to float to satisfy this signature. This records the precision that
    survives the round trip.
    """
    exact = Decimal("66666.67")
    r = calculate_jewelry_gst(
        material_value=exact, making_charges=0,
        seller_state_code="08", buyer_state_code="08",
    )
    # 3% of 66666.67 = 2000.0001 -> rounds to 2000.00
    assert r.total_gst == Decimal("2000.00")


@pytest.mark.parametrize("seller,buyer,inter", [
    ("08", "08", False),
    ("08", "27", True),
    ("27", "27", False),
    (" 08", "08 ", False),   # surrounding whitespace is stripped
])
def test_place_of_supply_determines_the_tax_type(seller, buyer, inter):
    r = calculate_jewelry_gst(
        material_value=1000, making_charges=0,
        seller_state_code=seller, buyer_state_code=buyer,
    )
    if inter:
        assert r.total_igst > 0 and r.total_cgst == 0
    else:
        assert r.total_igst == 0 and r.total_cgst > 0


def test_unpadded_state_code_is_not_treated_as_inter_state():
    """'8' and '08' are Rajasthan. A raw string compare charged IGST wrongly."""
    r = calculate_jewelry_gst(
        material_value=100000, making_charges=0,
        seller_state_code="08", buyer_state_code="8",
    )

    assert r.total_igst == Decimal("0.00"), "same state must not produce IGST"
    assert r.total_cgst + r.total_sgst == Decimal("3000.00")


def test_genuinely_different_states_still_produce_igst():
    r = calculate_jewelry_gst(
        material_value=100000, making_charges=0,
        seller_state_code="8", buyer_state_code="27",
    )
    assert r.total_igst == Decimal("3000.00")


def test_decimal_input_is_exact_not_binary_widened():
    """Passing Decimal must not route through float and pick up expansion error."""
    r = calculate_jewelry_gst(
        material_value=Decimal("0.07"), making_charges=Decimal("0"),
        seller_state_code="08", buyer_state_code="08",
    )
    # 3% of 0.07 = 0.0021 -> 0.00 at 2dp. A float path can drift here.
    assert r.total_gst == Decimal("0.00")


def test_int_and_str_inputs_are_accepted_exactly():
    from_int = calculate_jewelry_gst(material_value=1000, making_charges=0)
    from_str = calculate_jewelry_gst(material_value="1000", making_charges=0)
    from_dec = calculate_jewelry_gst(material_value=Decimal("1000"), making_charges=0)

    assert from_int.total_gst == from_str.total_gst == from_dec.total_gst
