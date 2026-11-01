"""Expense bills: service items in the item master, and bills created from GSTR-2B rows.

Rent, electricity and professional fees arrive as GST bills. Booking them by
journal kept the credit out of the ITC register; a service item with its
expense ledger lets them go through purchases, and a 2B row the books lack
can be booked straight from the reconciliation screen.
"""

import io
from decimal import Decimal
from pathlib import Path

import pytest

from app.api.v1.gstr2b import rate_from_2b

ROOT = Path(__file__).resolve().parents[1]
INV = io.open(ROOT / "app" / "api" / "v1" / "inventory.py", encoding="utf-8").read()
G2B = io.open(ROOT / "app" / "api" / "v1" / "gstr2b.py", encoding="utf-8").read()


@pytest.mark.parametrize("taxable,igst,cgst,sgst,expected", [
    ("25000", "0", "2250", "2250", Decimal("18")),
    ("10000", "1800", "0", "0", Decimal("18")),
    ("100000", "0", "1500", "1500", Decimal("3")),
    ("100000", "0", "125", "125", Decimal("0.25")),
    ("1000", "0", "0", "0", Decimal("0")),
    ("0", "0", "0", "0", Decimal("0")),
    ("1000", "0", "35.5", "35.5", Decimal("7.10")),   # mixed-rate bill: exact ratio kept
])
def test_rate_implied_by_a_2b_row(taxable, igst, cgst, sgst, expected):
    assert rate_from_2b(taxable, igst, cgst, sgst) == expected


def test_service_item_requires_and_stores_its_expense_ledger():
    assert "expense_account_id: Optional[UUID] = None" in INV
    assert "A service item needs the expense ledger" in INV
    # the purchase posting debits stock_account_id, so that is where the expense ledger goes
    assert "SET stock_account_id = :sid, purchase_account_id = :sid" in INV


def test_bill_from_2b_goes_through_the_purchase_posting_and_pairs_the_rows():
    assert '@router.post("/gstr2b/entries/{entry_id}/create-bill"' in G2B
    body = G2B.split('@router.post("/gstr2b/entries/{entry_id}/create-bill"')[1].split("@router.")[0]
    assert "_post_purchase(" in body
    assert "LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')" in body
    assert "SET gstr2b_matched = TRUE" in body
    assert "already paired with a bill in the books" in body
    assert "FOR UPDATE" in body
