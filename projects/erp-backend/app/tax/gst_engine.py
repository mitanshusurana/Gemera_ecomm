"""
Caratloop ERP — Complete GST Calculation Engine
[CGST Rule 56(4)] — Tax Register for Manufacturers

Jewelry Dual-Rate GST:
    HSN 7113 — Gold/Gem Jewelry Material: 3% GST
    SAC 9988 — Making Charges / Job Work:  5% GST

State: Rajasthan (State Code 08)
    Intra-state supply → CGST 1.5% + SGST 1.5% on material
                         CGST 2.5% + SGST 2.5% on making
    Inter-state supply → IGST 3% on material, IGST 5% on making

RCM on Old Gold:
    Notification No. 13/2017-Central Tax (Rate)
    Purchase of old gold from unregistered individuals → RCM @ 3%
    Buyer (Caratloop) pays tax directly to government.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Union
from dataclasses import dataclass


Money = Union[Decimal, int, str, float]


def _money(val: Money) -> Decimal:
    """Coerce a monetary input to Decimal without losing precision.

    Decimal, int and str convert exactly. A float is routed through str() so a
    caller passing 66666.66666666667 gets that value rather than its binary
    expansion -- but callers should pass Decimal and avoid the question.
    """
    if isinstance(val, Decimal):
        return val
    if val is None:
        return Decimal("0")
    return Decimal(str(val))


def _normalise_state(code: Optional[str]) -> str:
    """Zero-pad a GST state code to two digits, so '8' == '08'."""
    cleaned = (code or "").strip()
    return cleaned.zfill(2) if cleaned.isdigit() else cleaned.upper()


def _round(val: Decimal) -> Decimal:
    """Round to 2 decimal places as per GST rounding rules."""
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass
class JewelryGSTResult:
    """Result of jewelry GST calculation [CGST-R56-4]."""
    is_inter_state: bool
    material_value: Decimal
    making_charges: Decimal
    # Material tax (3% split)
    cgst_material: Decimal
    sgst_material: Decimal
    igst_material: Decimal
    material_gst_total: Decimal
    # Making charges tax (5% split)
    cgst_making: Decimal
    sgst_making: Decimal
    igst_making: Decimal
    making_gst_total: Decimal
    # Totals
    total_cgst: Decimal
    total_sgst: Decimal
    total_igst: Decimal
    total_gst: Decimal
    grand_total: Decimal
    # Rates applied
    material_gst_rate: Decimal
    making_gst_rate: Decimal


@dataclass
class RCMResult:
    """RCM calculation result for old gold purchase [CGST-R56-4]."""
    is_rcm_applicable: bool
    purchase_value: Decimal
    rcm_rate: Decimal
    cgst_rcm: Decimal
    sgst_rcm: Decimal
    igst_rcm: Decimal
    total_rcm: Decimal


def calculate_jewelry_gst(
    material_value: Money,
    making_charges: Money,
    seller_state_code: str = "08",          # Caratloop = Rajasthan (08)
    buyer_state_code: str = "08",
    material_gst_rate: Money = Decimal("3.00"),   # [CGST-R56-4] 3% on HSN 7113
    making_gst_rate: Money = Decimal("5.00"),     # [CGST-R56-4] 5% on SAC 9988
) -> JewelryGSTResult:
    """
    Calculate GST for a jewelry sale transaction using dual-rate methodology.

    [CGST Rule 56(4)]: Every manufacturer must maintain accounts for tax payable,
    tax collected, and ITC. This function computes the exact split.

    Args:
        material_value: Value of gold + gemstones (taxable @ 3%)
        making_charges: Artisan/labor charges (taxable @ 5%)
        seller_state_code: Caratloop's state (default '08' = Rajasthan)
        buyer_state_code: Customer's state code
        material_gst_rate: GST rate on material (default 3%)
        making_gst_rate: GST rate on making charges (default 5%)

    Returns:
        JewelryGSTResult with all CGST/SGST/IGST amounts computed.
    """
    mat_val = _money(material_value)
    mak_val = _money(making_charges)
    mat_rate = _money(material_gst_rate) / 100
    mak_rate = _money(making_gst_rate) / 100

    # Normalise state codes before comparing: '8' and '08' are the same state,
    # but a raw string compare treated them as an inter-state supply and
    # charged IGST instead of CGST+SGST.
    is_inter_state = _normalise_state(seller_state_code) != _normalise_state(buyer_state_code)

    # Total tax on material and making
    mat_total_tax = _round(mat_val * mat_rate)
    mak_total_tax = _round(mak_val * mak_rate)

    if is_inter_state:
        # Inter-state: IGST only
        igst_mat = mat_total_tax
        cgst_mat = sgst_mat = Decimal("0.00")
        igst_mak = mak_total_tax
        cgst_mak = sgst_mak = Decimal("0.00")
    else:
        # Intra-state: CGST + SGST (equal split)
        igst_mat = Decimal("0.00")
        cgst_mat = _round(mat_total_tax / 2)
        sgst_mat = mat_total_tax - cgst_mat  # Handle odd paisa
        igst_mak = Decimal("0.00")
        cgst_mak = _round(mak_total_tax / 2)
        sgst_mak = mak_total_tax - cgst_mak

    total_cgst = cgst_mat + cgst_mak
    total_sgst = sgst_mat + sgst_mak
    total_igst = igst_mat + igst_mak
    total_gst = total_cgst + total_sgst + total_igst

    return JewelryGSTResult(
        is_inter_state=is_inter_state,
        material_value=mat_val,
        making_charges=mak_val,
        cgst_material=cgst_mat,
        sgst_material=sgst_mat,
        igst_material=igst_mat,
        material_gst_total=mat_total_tax,
        cgst_making=cgst_mak,
        sgst_making=sgst_mak,
        igst_making=igst_mak,
        making_gst_total=mak_total_tax,
        total_cgst=total_cgst,
        total_sgst=total_sgst,
        total_igst=total_igst,
        total_gst=total_gst,
        grand_total=mat_val + mak_val + total_gst,
        material_gst_rate=Decimal(str(material_gst_rate)),
        making_gst_rate=Decimal(str(making_gst_rate)),
    )


def calculate_rcm_old_gold(
    purchase_value: float,
    vendor_registered: bool,
    seller_state_code: str = "08",
    buyer_state_code: str = "08",
    rcm_rate: float = 3.00,
) -> RCMResult:
    """
    Calculate Reverse Charge Mechanism (RCM) tax for old gold purchase.

    [CGST Rule 56(4)]: Purchases from unregistered individuals trigger RCM.
    Notification No. 13/2017-CT(Rate): Old gold under reverse charge.

    If vendor is unregistered → Caratloop pays 3% GST directly to government.
    Caratloop can then avail ITC of the same amount in the same return period
    (subject to CGST Section 16(2)(d) conditions).

    Args:
        purchase_value: Value of old gold purchased
        vendor_registered: True if vendor has valid GSTIN (no RCM then)
        seller_state_code: Vendor's state (usually same as buyer for old gold)
        buyer_state_code: Caratloop's state ('08' = Rajasthan)
        rcm_rate: RCM rate (default 3% as per notification)
    """
    pv = Decimal(str(purchase_value))

    if vendor_registered:
        # Registered vendor charges GST on their invoice — no RCM [CGST-R56-4]
        return RCMResult(
            is_rcm_applicable=False,
            purchase_value=pv,
            rcm_rate=Decimal("0"),
            cgst_rcm=Decimal("0"),
            sgst_rcm=Decimal("0"),
            igst_rcm=Decimal("0"),
            total_rcm=Decimal("0"),
        )

    rate = Decimal(str(rcm_rate)) / 100
    total_rcm_tax = _round(pv * rate)
    is_inter_state = seller_state_code.strip() != buyer_state_code.strip()

    if is_inter_state:
        igst_rcm = total_rcm_tax
        cgst_rcm = sgst_rcm = Decimal("0.00")
    else:
        igst_rcm = Decimal("0.00")
        cgst_rcm = _round(total_rcm_tax / 2)
        sgst_rcm = total_rcm_tax - cgst_rcm

    return RCMResult(
        is_rcm_applicable=True,
        purchase_value=pv,
        rcm_rate=Decimal(str(rcm_rate)),
        cgst_rcm=cgst_rcm,
        sgst_rcm=sgst_rcm,
        igst_rcm=igst_rcm,
        total_rcm=total_rcm_tax,
    )


def calculate_gst_for_job_work(
    making_charges: Money,
    seller_state_code: str = "08",
    buyer_state_code: str = "08",
    gst_rate: Money = Decimal("5.00"),
) -> dict:
    """
    Calculate GST on job work / karigar making charges.
    SAC 9988 — Manufacturing services: 5% GST.
    If karigar is unregistered and providing pure labor → may be exempt.
    If registered → 5% on making charges.
    """
    mak = _money(making_charges)
    rate = _money(gst_rate) / 100
    total_tax = _round(mak * rate)
    # Same normalisation as calculate_jewelry_gst: '8' and '08' are one state,
    # and a raw compare charged IGST on an intra-state supply.
    is_inter = _normalise_state(seller_state_code) != _normalise_state(buyer_state_code)

    if is_inter:
        return {"igst": total_tax, "cgst": Decimal("0"), "sgst": Decimal("0"), "total": total_tax}
    else:
        half = _round(total_tax / 2)
        return {"igst": Decimal("0"), "cgst": half, "sgst": total_tax - half, "total": total_tax}


def get_return_period(date_str: str) -> str:
    """Convert a date to GST return period format 'YYYY-MM'."""
    from datetime import date
    if isinstance(date_str, str):
        d = date.fromisoformat(date_str)
    else:
        d = date_str
    return d.strftime("%Y-%m")


# ─── Export supplies and foreign currency ────────────────────────────────────
#
# Section 16 IGST Act: an export is a zero-rated supply. The exporter either
# (a) supplies under a Letter of Undertaking without paying IGST, or
# (b) pays IGST at the goods' own rate and claims it back as a refund.
# Either way the place of supply is outside India, which GSTR-1 records as
# state code 96 ("Other Country") in Table 6A, and the supply is inter-state
# by definition (s.7(5)(a) IGST Act), so it can never be CGST+SGST.
#
# A Bill of Supply (Rule 49) is issued for a supply on which no tax is
# charged; it carries no GST lines at all.

# GSTR-1 Table 6A place-of-supply code for a buyer outside India.
EXPORT_PLACE_OF_SUPPLY = "96"

EXPORT_LUT = "LUT_without_tax"
EXPORT_WITH_IGST = "With_IGST"
EXPORT_TYPES = (EXPORT_LUT, EXPORT_WITH_IGST)

# gst_output_tax_register.supply_type for the two export kinds; the GSTR-1
# JSON uses the same tokens (exp_typ WPAY / WOPAY) without the prefix.
SUPPLY_TYPE_FOR_EXPORT = {
    EXPORT_LUT: "Export_WOPAY",
    EXPORT_WITH_IGST: "Export_WPAY",
}

INVOICE_TYPE_TAX = "Tax_Invoice"
INVOICE_TYPE_EXPORT = "Export_Invoice"
INVOICE_TYPE_BILL_OF_SUPPLY = "Bill_of_Supply"
INVOICE_TYPES = (INVOICE_TYPE_TAX, INVOICE_TYPE_EXPORT, INVOICE_TYPE_BILL_OF_SUPPLY)

HOME_CURRENCY = "INR"


def _zero_gst(mat_val: Decimal, mak_val: Decimal, material_gst_rate: Money, making_gst_rate: Money) -> JewelryGSTResult:
    z = Decimal("0.00")
    return JewelryGSTResult(
        is_inter_state=True,
        material_value=mat_val,
        making_charges=mak_val,
        cgst_material=z, sgst_material=z, igst_material=z, material_gst_total=z,
        cgst_making=z, sgst_making=z, igst_making=z, making_gst_total=z,
        total_cgst=z, total_sgst=z, total_igst=z, total_gst=z,
        grand_total=mat_val + mak_val,
        material_gst_rate=Decimal(str(material_gst_rate)),
        making_gst_rate=Decimal(str(making_gst_rate)),
    )


def calculate_export_gst(
    material_value: Money,
    making_charges: Money,
    export_type: str,
    material_gst_rate: Money = Decimal("3.00"),
    making_gst_rate: Money = Decimal("5.00"),
) -> JewelryGSTResult:
    """GST on an export invoice, in the currency the values are given in.

    Under LUT every tax figure is zero. With payment of IGST the tax is IGST
    at the material and making rates, exactly as an inter-state domestic sale
    would be charged -- so the same engine is used with a buyer state that
    cannot equal the seller's.
    """
    if export_type not in EXPORT_TYPES:
        raise ValueError(f"export_type must be one of {EXPORT_TYPES}, got {export_type!r}")
    mat_val = _money(material_value)
    mak_val = _money(making_charges)
    if export_type == EXPORT_LUT:
        return _zero_gst(mat_val, mak_val, material_gst_rate, making_gst_rate)
    return calculate_jewelry_gst(
        material_value=mat_val,
        making_charges=mak_val,
        seller_state_code="08",
        buyer_state_code=EXPORT_PLACE_OF_SUPPLY,
        material_gst_rate=material_gst_rate,
        making_gst_rate=making_gst_rate,
    )


def calculate_bill_of_supply(
    material_value: Money,
    making_charges: Money,
    material_gst_rate: Money = Decimal("0.00"),
    making_gst_rate: Money = Decimal("0.00"),
) -> JewelryGSTResult:
    """A Bill of Supply carries no tax: every GST figure is zero."""
    return _zero_gst(_money(material_value), _money(making_charges), material_gst_rate, making_gst_rate)


def to_inr(amount: Money, exchange_rate: Money) -> Decimal:
    """A foreign-currency amount in rupees at the invoice's exchange rate.

    Rounded to the paisa: the rupee figure is what the books and the GST
    return carry, and s.15 read with Rule 34 fixes the rate at the invoice
    date (the CBIC notified rate for exports, or the RBI reference rate).
    """
    rate = _money(exchange_rate)
    if rate <= 0:
        raise ValueError("exchange_rate must be positive")
    return _round(_money(amount) * rate)
