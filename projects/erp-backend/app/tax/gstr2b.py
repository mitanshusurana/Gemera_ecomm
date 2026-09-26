"""GSTR-2B: parse the portal's JSON and match it against the ITC register.

s.16(2)(aa) CGST Act: input tax credit may be claimed only where the supplier
has furnished the invoice in GSTR-1 and it has been communicated to the
recipient -- which is what GSTR-2B is. itc_register has carried gstr2b_matched
since the baseline and nothing ever set it, so every claim was, in the
register's own terms, unmatched.

Both halves here are pure. Parsing accepts the document as the portal
downloads it (``{"data": {"gstin", "rtnprd", "docdata": {"b2b": [...]}}}``)
and also the bare ``docdata`` or a bare ``b2b`` list, since accountants strip
wrappers. Matching keys on (supplier GSTIN, normalised invoice number) and
compares taxable value and each tax head within a rupee: the portal rounds
and so do suppliers, and a paisa difference is not a mismatch.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable, Mapping, Optional

from app.core.money import round_money, to_decimal

MATCHED = "Matched"
MISMATCH = "Mismatch"
MISSING_IN_BOOKS = "Missing_In_Books"
MISSING_IN_2B = "Missing_In_2B"
MATCH_STATUSES = frozenset({MATCHED, MISMATCH, MISSING_IN_BOOKS, MISSING_IN_2B})

DEFAULT_TOLERANCE = Decimal("1")

_NOT_ALNUM = re.compile(r"[^A-Z0-9]")


def normalise_invoice_no(value: Any) -> str:
    """Upper-case alphanumerics only, leading zeros dropped.

    'inv-0042/A', 'INV 0042 A' and 'INV0042A' are the same supplier invoice;
    what differs is how two data-entry operators typed it.
    """
    s = _NOT_ALNUM.sub("", str(value or "").upper())
    return s.lstrip("0") or s


def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    s = str(value).strip()
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def period_from_rtnprd(value: Any) -> Optional[str]:
    """'042026' (MMYYYY, as the portal writes it) -> '2026-04'."""
    s = str(value or "").strip()
    if len(s) == 6 and s.isdigit():
        return f"{s[2:]}-{s[:2]}"
    if len(s) == 7 and s[4] == "-":
        return s
    return None


@dataclass
class B2BInvoice:
    supplier_gstin: str
    invoice_no: str
    invoice_date: Optional[date]
    invoice_value: Decimal
    place_of_supply: Optional[str]
    reverse_charge: bool
    itc_available: bool
    taxable: Decimal
    igst: Decimal
    cgst: Decimal
    sgst: Decimal
    cess: Decimal
    supplier_name: Optional[str] = None
    raw: dict = field(default_factory=dict)

    @property
    def key(self) -> tuple[str, str]:
        return self.supplier_gstin.upper(), normalise_invoice_no(self.invoice_no)

    @property
    def total_tax(self) -> Decimal:
        return self.igst + self.cgst + self.sgst + self.cess


def _yes(value: Any) -> bool:
    return str(value or "").strip().upper() in {"Y", "YES", "TRUE", "1"}


def parse_gstr2b(doc: Any) -> tuple[Optional[str], list[B2BInvoice]]:
    """(return period or None, B2B invoices) from a GSTR-2B document."""
    period = None
    b2b: Any = None
    if isinstance(doc, list):
        b2b = doc
    elif isinstance(doc, Mapping):
        data = doc.get("data") if isinstance(doc.get("data"), Mapping) else doc
        period = period_from_rtnprd(data.get("rtnprd") or doc.get("rtnprd") or data.get("fp") or doc.get("fp"))
        docdata = data.get("docdata") if isinstance(data.get("docdata"), Mapping) else data
        b2b = docdata.get("b2b")
    if not isinstance(b2b, list):
        raise ValueError("Not a GSTR-2B document: no data.docdata.b2b[] section found.")

    out: list[B2BInvoice] = []
    for supplier in b2b:
        if not isinstance(supplier, Mapping):
            continue
        gstin = str(supplier.get("ctin") or "").strip().upper()
        name = supplier.get("trdnm") or supplier.get("supplier_name")
        for inv in supplier.get("inv") or []:
            if not isinstance(inv, Mapping):
                continue
            items = inv.get("items") or inv.get("itms") or []
            taxable = igst = cgst = sgst = cess = Decimal("0")
            for it in items:
                det = it.get("itm_det", it) if isinstance(it, Mapping) else {}
                taxable += to_decimal(det.get("txval"))
                igst += to_decimal(det.get("igst", det.get("iamt")))
                cgst += to_decimal(det.get("cgst", det.get("camt")))
                sgst += to_decimal(det.get("sgst", det.get("samt")))
                cess += to_decimal(det.get("cess", det.get("csamt")))
            inum = str(inv.get("inum") or "").strip()
            if not gstin or not inum:
                continue
            out.append(B2BInvoice(
                supplier_gstin=gstin,
                supplier_name=str(name)[:200] if name else None,
                invoice_no=inum[:50],
                invoice_date=_parse_date(inv.get("idt")),
                invoice_value=round_money(inv.get("val")),
                place_of_supply=(str(inv.get("pos")).zfill(2) if inv.get("pos") not in (None, "") else None),
                reverse_charge=_yes(inv.get("rev")),
                itc_available=_yes(inv.get("itcavl", "Y")),
                taxable=round_money(taxable),
                igst=round_money(igst),
                cgst=round_money(cgst),
                sgst=round_money(sgst),
                cess=round_money(cess),
                raw=dict(inv),
            ))
    return period, out


@dataclass
class MatchResult:
    matched: list[tuple[B2BInvoice, Mapping[str, Any]]] = field(default_factory=list)
    mismatch: list[tuple[B2BInvoice, Mapping[str, Any], str]] = field(default_factory=list)
    missing_in_books: list[B2BInvoice] = field(default_factory=list)
    missing_in_2b: list[Mapping[str, Any]] = field(default_factory=list)


def _itc_key(row: Mapping[str, Any]) -> tuple[str, str]:
    return str(row.get("vendor_gstin") or "").strip().upper(), normalise_invoice_no(row.get("invoice_no"))


def compare_amounts(entry: B2BInvoice, itc: Mapping[str, Any], tolerance: Decimal = DEFAULT_TOLERANCE) -> list[str]:
    """Human-readable differences beyond ``tolerance``; empty when they agree.

    The books' taxable value may be unknown (an ITC row whose bill has gone),
    in which case only the tax heads are compared.
    """
    notes = []
    checks = [
        ("IGST", entry.igst, to_decimal(itc.get("igst_credit"))),
        ("CGST", entry.cgst, to_decimal(itc.get("cgst_credit"))),
        ("SGST", entry.sgst, to_decimal(itc.get("sgst_credit"))),
    ]
    if itc.get("taxable") is not None:
        checks.insert(0, ("taxable value", entry.taxable, to_decimal(itc.get("taxable"))))
    for label, in_2b, in_books in checks:
        if abs(in_2b - in_books) > tolerance:
            notes.append(f"{label}: 2B {in_2b} vs books {in_books}")
    return notes


def match_entries(
    entries: Iterable[B2BInvoice],
    itc_rows: Iterable[Mapping[str, Any]],
    *,
    tolerance: Decimal = DEFAULT_TOLERANCE,
) -> MatchResult:
    """Pair GSTR-2B invoices with ITC register rows.

    ``itc_rows`` carry id, vendor_gstin, invoice_no (the SUPPLIER'S number),
    taxable (may be None), igst_credit, cgst_credit, sgst_credit. Each row is
    used at most once; when a supplier has two rows with the same number
    (a genuine duplicate bill), they pair in the order given.
    """
    by_key: dict[tuple[str, str], list[Mapping[str, Any]]] = {}
    for row in itc_rows:
        by_key.setdefault(_itc_key(row), []).append(row)

    result = MatchResult()
    for entry in entries:
        candidates = by_key.get(entry.key)
        if not candidates:
            result.missing_in_books.append(entry)
            continue
        itc = candidates.pop(0)
        notes = compare_amounts(entry, itc, tolerance)
        if notes:
            result.mismatch.append((entry, itc, "; ".join(notes)))
        else:
            result.matched.append((entry, itc))
    for leftover in by_key.values():
        result.missing_in_2b.extend(leftover)
    return result
