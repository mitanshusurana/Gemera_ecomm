"""GSTR-2B parsing and matching on fixtures; the GSTR-3B JSON with RCM."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.api.v1.gst import build_gstr3b_json
from app.tax.gstr2b import (
    B2BInvoice,
    compare_amounts,
    match_entries,
    normalise_invoice_no,
    parse_gstr2b,
    period_from_rtnprd,
)

PORTAL_DOC = {
    "chksum": "abc",
    "data": {
        "gstin": "08AAACC1234A1Z5",
        "rtnprd": "082026",
        "gendt": "14-09-2026",
        "docdata": {
            "b2b": [
                {
                    "ctin": "08AABCS1234B1ZQ",
                    "trdnm": "Shree Bullion",
                    "supfildt": "11-09-2026",
                    "supprd": "082026",
                    "inv": [
                        {
                            "inum": "SB/26-27/0042", "idt": "05-08-2026", "val": 515000.00, "pos": "08",
                            "rev": "N", "itcavl": "Y", "rsn": "",
                            "items": [
                                {"num": 1, "rt": 3, "txval": 500000.00, "igst": 0, "cgst": 7500.00, "sgst": 7500.00, "cess": 0},
                            ],
                        },
                        {
                            "inum": "SB/26-27/0050", "idt": "20-08-2026", "val": 103000.00, "pos": "08",
                            "rev": "N", "itcavl": "Y",
                            "items": [
                                {"num": 1, "rt": 3, "txval": 100000.00, "cgst": 1500.00, "sgst": 1500.00},
                            ],
                        },
                    ],
                },
                {
                    "ctin": "27AAGCM9999M1ZK",
                    "trdnm": "Mumbai Gems",
                    "inv": [
                        {
                            "inum": "MG-778", "idt": "28-08-2026", "val": 206000.00, "pos": "08", "rev": "N", "itcavl": "Y",
                            "items": [
                                {"num": 1, "rt": 3, "txval": 200000.00, "igst": 6000.00, "cgst": 0, "sgst": 0},
                            ],
                        },
                    ],
                },
            ]
        },
    },
}


def test_period_from_rtnprd():
    assert period_from_rtnprd("082026") == "2026-08"
    assert period_from_rtnprd("2026-08") == "2026-08"
    assert period_from_rtnprd("") is None


def test_normalise_invoice_no_collapses_typing_variants():
    assert normalise_invoice_no("sb/26-27/0042") == normalise_invoice_no("SB 26 27 0042") == "SB26270042"
    assert normalise_invoice_no("0042") == "42"
    assert normalise_invoice_no("000") == "000"
    assert normalise_invoice_no(None) == ""


def test_parse_portal_document():
    period, rows = parse_gstr2b(PORTAL_DOC)
    assert period == "2026-08"
    assert len(rows) == 3
    first = rows[0]
    assert first.supplier_gstin == "08AABCS1234B1ZQ"
    assert first.supplier_name == "Shree Bullion"
    assert first.invoice_no == "SB/26-27/0042"
    assert first.invoice_date == date(2026, 8, 5)
    assert first.taxable == Decimal("500000.00")
    assert first.cgst == first.sgst == Decimal("7500.00")
    assert first.igst == 0 and first.total_tax == Decimal("15000.00")
    assert first.itc_available and not first.reverse_charge
    assert rows[2].igst == Decimal("6000.00")


def test_parse_accepts_stripped_wrappers():
    _, rows = parse_gstr2b(PORTAL_DOC["data"]["docdata"])
    assert len(rows) == 3
    _, rows = parse_gstr2b(PORTAL_DOC["data"]["docdata"]["b2b"])
    assert len(rows) == 3


def test_parse_rejects_non_2b():
    with pytest.raises(ValueError):
        parse_gstr2b({"hello": "world"})


def _itc(id_, gstin, inv, taxable, igst=0, cgst=0, sgst=0):
    return {"id": id_, "vendor_gstin": gstin, "invoice_no": inv, "taxable": Decimal(str(taxable)),
            "igst_credit": Decimal(str(igst)), "cgst_credit": Decimal(str(cgst)), "sgst_credit": Decimal(str(sgst))}


def test_match_produces_the_four_buckets():
    _, entries = parse_gstr2b(PORTAL_DOC)
    books = [
        # exact match (typed with spaces instead of slashes)
        _itc(1, "08AABCS1234B1ZQ", "SB 26-27 0042", 500000, cgst=7500, sgst=7500),
        # within a rupee: 0.60 paise off on taxable, tax equal
        _itc(2, "08aabcs1234b1zq", "SB/26-27/0050", "100000.60", cgst=1500, sgst=1500),
        # mismatch: books claim IGST 9000 where 2B says 6000
        _itc(3, "27AAGCM9999M1ZK", "MG-778", 200000, igst=9000),
        # only in the books
        _itc(4, "08AABCS1234B1ZQ", "SB/26-27/0099", 1000, cgst=15, sgst=15),
    ]
    result = match_entries(entries, books)
    assert [itc["id"] for _, itc in result.matched] == [1, 2]
    assert [(itc["id"]) for _, itc, _ in result.mismatch] == [3]
    assert "IGST: 2B 6000.00 vs books 9000" in result.mismatch[0][2]
    assert result.missing_in_books == []
    assert [r["id"] for r in result.missing_in_2b] == [4]


def test_match_reports_missing_in_books():
    _, entries = parse_gstr2b(PORTAL_DOC)
    result = match_entries(entries, [])
    assert len(result.missing_in_books) == 3
    assert result.matched == [] and result.missing_in_2b == []


def test_each_book_row_is_used_once():
    entry = B2BInvoice("08AABCS1234B1ZQ", "X-1", None, Decimal("103"), "08", False, True,
                       Decimal("100"), Decimal("0"), Decimal("1.5"), Decimal("1.5"), Decimal("0"))
    dup = B2BInvoice("08AABCS1234B1ZQ", "X-1", None, Decimal("103"), "08", False, True,
                     Decimal("100"), Decimal("0"), Decimal("1.5"), Decimal("1.5"), Decimal("0"))
    books = [_itc(1, "08AABCS1234B1ZQ", "X-1", 100, cgst=1.5, sgst=1.5)]
    result = match_entries([entry, dup], books)
    assert len(result.matched) == 1 and len(result.missing_in_books) == 1


def test_compare_skips_taxable_when_books_have_none():
    entry = B2BInvoice("G", "1", None, Decimal("0"), None, False, True,
                       Decimal("100"), Decimal("3"), Decimal("0"), Decimal("0"), Decimal("0"))
    itc = {"taxable": None, "igst_credit": Decimal("3"), "cgst_credit": 0, "sgst_credit": 0}
    assert compare_amounts(entry, itc) == []
    itc["igst_credit"] = Decimal("5")
    assert compare_amounts(entry, itc) == ["IGST: 2B 3 vs books 5"]


# ─── GSTR-3B JSON: Table 3.1(d) and 4(A)(3) ──────────────────────────────────

def test_gstr3b_json_carries_rcm_tables():
    out = {"taxable_value": Decimal("1000000"), "igst": 0, "cgst": Decimal("15000"), "sgst": Decimal("15000")}
    itc = {"igst_itc": Decimal("6000"), "cgst_itc": Decimal("9000"), "sgst_itc": Decimal("9000")}
    rcm = {"taxable_value": Decimal("200000"), "igst_rcm": 0, "cgst_rcm": Decimal("3000"), "sgst_rcm": Decimal("3000")}
    doc = build_gstr3b_json("2026-08", out, itc, rcm, gstin="08AAACC1234A1Z5")
    assert doc["gstin"] == "08AAACC1234A1Z5"
    assert doc["ret_period"] == "082026"
    assert doc["sup_details"]["osup_det"]["txval"] == 1000000.0
    assert doc["sup_details"]["isup_rev"] == {"txval": 200000.0, "iamt": 0.0, "camt": 3000.0, "samt": 3000.0, "csamt": 0.0}
    by_type = {row["ty"]: row for row in doc["itc_elg"]["itc_avl"]}
    assert by_type["ISRC"]["camt"] == 3000.0 and by_type["ISRC"]["samt"] == 3000.0
    assert by_type["OTH"]["iamt"] == 6000.0 and by_type["OTH"]["camt"] == 9000.0


def test_gstr3b_json_tolerates_empty_period():
    doc = build_gstr3b_json("2026-09", None, None, None)
    assert doc["sup_details"]["isup_rev"]["txval"] == 0.0
    assert all(v == 0.0 for v in doc["itc_elg"]["itc_avl"][0].values() if isinstance(v, float))
