"""NIC e-invoice JSON (schema version 1.1) from the rows this ERP stores.

The Invoice Registration Portal accepts one JSON document per invoice and
returns the IRN, acknowledgement and signed QR. The document is built here
from ``caratloop.companies`` (SellerDtls), ``caratloop.parties`` (BuyerDtls),
``caratloop.sales_invoices`` (DocDtls, ValDtls) and ``sales_invoice_lines``
(ItemList). Nothing is read from the database in this module: the endpoint
fetches the rows and hands them in, so the builder is testable on fixtures.

Two things about the jewellery trade shape the item list:

* A jewellery invoice line is two supplies at two rates -- the metal and
  stones at 3% (HSN 7113) and the making at 5% (SAC 998892). The IRP wants one
  item per rate, so a line with non-zero making charges becomes two items: the
  goods leg and a service leg with ``IsServc = "Y"``.
* TCS under s.206C(1H) has no field of its own in schema 1.1. The IRP's own
  FAQ puts it in ``OthChrg``, and so does this builder.

Only B2B is e-invoiced. A B2C invoice (buyer without a GSTIN) is refused with
a message rather than sent: the IRP would reject it, and the dynamic QR that
B2C invoices above Rs 500 crore turnover need is a different thing entirely.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable, Mapping, Optional

from app.core.money import ZERO, round_money, to_decimal
from app.tax.gstin import is_gstin_shaped
from app.tax.job_work import JOB_WORK_SAC

SCHEMA_VERSION = "1.1"

# Unit codes the IRP accepts (the GST UQC list), from the codes the item
# master uses. Anything unknown goes out as OTH, which the IRP accepts.
UQC_BY_UOM = {
    "gm": "GMS", "g": "GMS", "gms": "GMS", "gram": "GMS", "grams": "GMS",
    "kg": "KGS", "kgs": "KGS",
    "ct": "CTM", "cts": "CTM", "carat": "CTM", "carats": "CTM",
    "pcs": "PCS", "pc": "PCS", "piece": "PCS", "pieces": "PCS",
    "nos": "NOS", "no": "NOS", "unit": "UNT", "units": "UNT",
    "pair": "PRS", "pairs": "PRS", "set": "SET", "sets": "SET",
    "mg": "MGS", "oz": "OTH",
}
DEFAULT_UQC = "OTH"

# DocDtls.No: 1-16 characters, alphanumeric plus '/' and '-'. "CL/2026-27/00001"
# is exactly sixteen.
_DOC_NO_RE = re.compile(r"^[A-Za-z0-9/\-]{1,16}$")
_PIN_RE = re.compile(r"^[1-9][0-9]{5}$")


class EInvoiceValidationError(ValueError):
    """The invoice cannot be sent as it stands. ``errors`` names every reason."""

    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = list(errors)


def _get(row: Mapping[str, Any] | None, key: str, default=None):
    if row is None:
        return default
    try:
        value = row[key]
    except (KeyError, TypeError):
        value = getattr(row, key, default)
    return default if value is None else value


def _num(value) -> float:
    """Money as the IRP wants it: a JSON number to two places."""
    return float(round_money(to_decimal(value)))


def _qty(value) -> float:
    return float(to_decimal(value).quantize(Decimal("0.001")))


def _text(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _date_ddmmyyyy(value) -> str:
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    d = date.fromisoformat(str(value)[:10])
    return d.strftime("%d/%m/%Y")


def _digits(value) -> str:
    return re.sub(r"\D", "", str(value or ""))


def supply_type_for(party: Mapping[str, Any]) -> str:
    """TranDtls.SupTyp from the buyer's registration type."""
    reg = str(_get(party, "gst_reg_type", "") or "").strip().lower()
    if reg == "sez":
        return "SEZWP"      # SEZ with payment of tax; without-payment needs a LUT flag we do not store
    if reg == "export":
        return "EXPWP"
    return "B2B"


def _address(row: Mapping[str, Any], *, who: str, errors: list[str], require_gstin: bool) -> dict:
    gstin = str(_get(row, "gstin", "") or "").strip().upper()
    if require_gstin and not is_gstin_shaped(gstin):
        errors.append(f"{who} GSTIN is missing or malformed")
    addr1 = _text(_get(row, "address_line1", ""), 100)
    if not addr1:
        errors.append(f"{who} address line 1 is required")
    city = _text(_get(row, "city", ""), 50)
    if len(city) < 3:
        errors.append(f"{who} city/location is required (at least 3 characters)")
    pin = _digits(_get(row, "pincode", ""))
    if not _PIN_RE.match(pin):
        errors.append(f"{who} pincode must be six digits")
    state = str(_get(row, "state_code", "") or "").strip()
    if state.isdigit():
        state = state.zfill(2)
    if not (len(state) == 2 and state.isdigit()):
        errors.append(f"{who} state code is required (two digits)")
    if gstin and state and gstin[:2] != state:
        errors.append(f"{who} GSTIN state ({gstin[:2]}) does not match the recorded state code ({state})")

    block: dict[str, Any] = {
        "Gstin": gstin or None,
        "LglNm": _text(_get(row, "legal_name", None) or _get(row, "name", ""), 100),
        "Addr1": addr1,
        "Loc": city,
        "Pin": int(pin) if pin.isdigit() else None,
        "Stcd": state,
    }
    if len(block["LglNm"]) < 3:
        errors.append(f"{who} legal name is required (at least 3 characters)")
    trade = _text(_get(row, "trade_name", ""), 100)
    if trade:
        block["TrdNm"] = trade
    addr2 = _text(_get(row, "address_line2", ""), 100)
    if addr2:
        block["Addr2"] = addr2
    phone = _digits(_get(row, "phone", ""))[-12:]
    if 6 <= len(phone) <= 12:
        block["Ph"] = phone
    email = _text(_get(row, "email", ""), 100)
    if "@" in email and len(email) >= 6:
        block["Em"] = email
    return block


def _uqc(uom_code) -> str:
    return UQC_BY_UOM.get(str(uom_code or "").strip().lower(), DEFAULT_UQC)


def build_items(lines: Iterable[Mapping[str, Any]], is_inter_state: bool, errors: list[str]) -> list[dict]:
    items: list[dict] = []
    sl = 0
    for idx, line in enumerate(lines, 1):
        hsn = _digits(_get(line, "hsn_sac_code", ""))
        if not (4 <= len(hsn) <= 8):
            errors.append(f"line {idx}: HSN must be 4 to 8 digits (got '{_get(line, 'hsn_sac_code', '')}')")
        desc = _text(_get(line, "description", "") or f"Line {idx}", 300)
        qty = to_decimal(_get(line, "quantity", 1)) or Decimal("1")

        material_value = round_money(_get(line, "material_value", 0))
        taxable_mat = round_money(_get(line, "taxable_material", material_value))
        making = round_money(_get(line, "making_charges", 0))
        taxable_mak = round_money(_get(line, "taxable_making", making))
        other = round_money(_get(line, "other_charges", 0))

        mat_rate = to_decimal(_get(line, "material_gst_rate", 3))
        mak_rate = to_decimal(_get(line, "making_gst_rate", 5))

        igst_m = round_money(_get(line, "igst_material", 0))
        cgst_m = round_money(_get(line, "cgst_material", 0))
        sgst_m = round_money(_get(line, "sgst_material", 0))
        igst_k = round_money(_get(line, "igst_making", 0))
        cgst_k = round_money(_get(line, "cgst_making", 0))
        sgst_k = round_money(_get(line, "sgst_making", 0))

        # Goods leg: the metal and stones. Always present, even at zero, so the
        # HSN of the piece appears on the e-invoice.
        sl += 1
        unit_price = (material_value / qty) if qty else material_value
        goods = {
            "SlNo": str(sl),
            "PrdDesc": desc,
            "IsServc": "N",
            "HsnCd": hsn,
            "Qty": _qty(qty),
            "Unit": _uqc(_get(line, "uom", None) or _get(line, "uom_code", None)),
            "UnitPrice": float(unit_price.quantize(Decimal("0.001"))),
            "TotAmt": _num(material_value),
            "Discount": _num(material_value - taxable_mat),
            "OthChrg": _num(other),
            "AssAmt": _num(taxable_mat),
            "GstRt": float(mat_rate),
            "IgstAmt": _num(igst_m),
            "CgstAmt": _num(cgst_m),
            "SgstAmt": _num(sgst_m),
            "TotItemVal": _num(taxable_mat + igst_m + cgst_m + sgst_m + other),
        }
        if is_inter_state and (cgst_m or sgst_m):
            errors.append(f"line {idx}: inter-state supply carries CGST/SGST on the material")
        items.append(goods)

        # Service leg: making charges at their own rate under the jewellery
        # manufacturing SAC.
        if making > 0:
            sl += 1
            items.append({
                "SlNo": str(sl),
                "PrdDesc": _text(f"Making charges — {desc}", 300),
                "IsServc": "Y",
                "HsnCd": JOB_WORK_SAC,
                "Qty": 1.0,
                "Unit": DEFAULT_UQC,
                "UnitPrice": _num(making),
                "TotAmt": _num(making),
                "Discount": _num(making - taxable_mak),
                "OthChrg": 0.0,
                "AssAmt": _num(taxable_mak),
                "GstRt": float(mak_rate),
                "IgstAmt": _num(igst_k),
                "CgstAmt": _num(cgst_k),
                "SgstAmt": _num(sgst_k),
                "TotItemVal": _num(taxable_mak + igst_k + cgst_k + sgst_k),
            })
    if not items:
        errors.append("the invoice has no lines")
    return items


def build_einvoice_payload(
    company: Mapping[str, Any],
    invoice: Mapping[str, Any],
    lines: Iterable[Mapping[str, Any]],
    party: Mapping[str, Any],
) -> dict:
    """The schema-1.1 document, or raise EInvoiceValidationError.

    Every defect found is reported together, so the user fixes the party
    master once rather than once per field.
    """
    errors: list[str] = []
    lines = list(lines)

    buyer_gstin = str(_get(party, "gstin", "") or _get(invoice, "customer_gstin", "") or "").strip().upper()
    if not is_gstin_shaped(buyer_gstin):
        raise EInvoiceValidationError([
            "This is a B2C invoice (the buyer has no GSTIN). e-Invoicing under Rule 48(4) "
            "applies to B2B supplies only; a B2C tax invoice is issued without an IRN."
        ])

    seller = _address(company, who="Seller", errors=errors, require_gstin=True)
    buyer = _address(party, who="Buyer", errors=errors, require_gstin=True)
    buyer["Gstin"] = buyer_gstin

    pos = str(_get(invoice, "place_of_supply", "") or buyer.get("Stcd") or "").strip()
    if pos.isdigit():
        pos = pos.zfill(2)
    if not (len(pos) == 2 and pos.isdigit()):
        errors.append("place of supply is required (two-digit state code)")
    buyer["Pos"] = pos

    doc_no = str(_get(invoice, "invoice_no", "") or "").strip()
    if not _DOC_NO_RE.match(doc_no):
        errors.append(
            f"invoice number '{doc_no}' is not acceptable to the IRP (1-16 characters, letters, digits, '/' and '-')"
        )
    try:
        doc_dt = _date_ddmmyyyy(_get(invoice, "invoice_date", None))
    except (TypeError, ValueError):
        doc_dt = ""
        errors.append("invoice date is missing")

    is_inter_state = bool(_get(invoice, "is_inter_state", False))
    items = build_items(lines, is_inter_state, errors)

    ass_val = sum((to_decimal(i["AssAmt"]) for i in items), ZERO)
    cgst = sum((to_decimal(i["CgstAmt"]) for i in items), ZERO)
    sgst = sum((to_decimal(i["SgstAmt"]) for i in items), ZERO)
    igst = sum((to_decimal(i["IgstAmt"]) for i in items), ZERO)
    other = sum((to_decimal(i["OthChrg"]) for i in items), ZERO)
    tcs = round_money(_get(invoice, "tcs_amount", 0))
    round_off = round_money(_get(invoice, "round_off", 0))
    total = round_money(ass_val + cgst + sgst + igst + other + tcs + round_off)

    stored_total = round_money(_get(invoice, "grand_total", total))
    if abs(stored_total - total) > Decimal("1.00"):
        errors.append(
            f"invoice total {stored_total} does not agree with its lines ({total}); "
            "the invoice must be corrected before an IRN is requested"
        )

    if errors:
        raise EInvoiceValidationError(errors)

    payload = {
        "Version": SCHEMA_VERSION,
        "TranDtls": {
            "TaxSch": "GST",
            "SupTyp": supply_type_for(party),
            "RegRev": "N",
            "IgstOnIntra": "N",
        },
        "DocDtls": {"Typ": "INV", "No": doc_no, "Dt": doc_dt},
        "SellerDtls": seller,
        "BuyerDtls": buyer,
        "ItemList": items,
        "ValDtls": {
            "AssVal": _num(ass_val),
            "CgstVal": _num(cgst),
            "SgstVal": _num(sgst),
            "IgstVal": _num(igst),
            "CesVal": 0.0,
            "StCesVal": 0.0,
            "Discount": 0.0,
            "OthChrg": _num(other + tcs),
            "RndOffAmt": _num(round_off),
            "TotInvVal": _num(total),
        },
    }
    # Optional keys the IRP rejects when null.
    for block in (payload["SellerDtls"], payload["BuyerDtls"]):
        for key in [k for k, v in block.items() if v is None]:
            del block[key]
    return payload


def validate_only(company, invoice, lines, party) -> list[str]:
    """The validation errors for a preview, without raising. Empty = sendable."""
    try:
        build_einvoice_payload(company, invoice, lines, party)
    except EInvoiceValidationError as exc:
        return exc.errors
    return []
