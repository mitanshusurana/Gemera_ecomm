"""Two things that decided tax treatment on the strength of a non-empty string.

Registration. purchases.py decided a supplier was registered if the GSTIN
string was non-empty and not one of four spellings of "unregistered", so
"NA", "-", "Not registered" and any fifteen random characters all counted as
registered -- and from that one boolean flowed an ITC register row, a
forward-charge GST posting and a GSTR-1 B2B line. sales.py classified an
invoice B2B on the same test. Both now ask app.tax.gstin.is_gstin_shaped.

Settlement. A receipt or payment voucher of ANY amount set the invoice to
'Paid'. A one-rupee advance against a ten-lakh bill marked the bill settled,
dropped it from the outstanding report and hid it from the 180-day test in
CGST s.16(2)(d) / Rule 37.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.tax.gstin import checksum_ok, decode, is_gstin_shaped

# ---------------------------------------------------------------- shape


@pytest.mark.parametrize("value", ["27AAPFU0939F1ZV", "08AAACJ1234E1ZP", "29AAGCB7383J1Z4"])
def test_a_real_looking_gstin_is_shaped(value):
    assert is_gstin_shaped(value) is True


@pytest.mark.parametrize("value", [
    None, "", "NA", "N/A", "-", "Unregistered", "UNREGISTERED", "Not registered",
    "9800000001",             # a phone number
    "27AAPFU0939F1Z",         # fourteen characters
    "27AAPFU0939F1ZVX",       # sixteen
    "27aapfu0939f1zv ",       # lower case with trailing space is still shaped once normalised
])
def test_things_that_are_not_a_gstin(value):
    # The last one IS shaped after normalisation; everything else is not.
    expected = value is not None and value.strip().upper() == "27AAPFU0939F1ZV"
    assert is_gstin_shaped(value) is expected


def test_the_sentinel_words_the_old_code_special_cased_are_all_unshaped():
    """The old test only rejected these four; is_gstin_shaped rejects them
    for the same reason it rejects everything else that is not a GSTIN."""
    for word in ["UNREGISTERED", "N/A", "NONE", ""]:
        assert is_gstin_shaped(word) is False


# ---------------------------------------------------------------- checksum


def test_checksum_true_false_none_are_three_different_answers():
    assert checksum_ok("27AAPFU0939F1ZV") is True
    assert checksum_ok("27AAPFU0939F1ZW") is False    # last digit wrong
    assert checksum_ok("NA") is None                  # cannot be evaluated


# ---------------------------------------------------------------- decode


def test_decode_reads_state_and_pan_without_a_provider():
    d = decode("27AAPFU0939F1ZV")
    assert d is not None
    assert d.state_code == "27"
    assert d.state_name == "Maharashtra"
    assert d.pan == "AAPFU0939F"


def test_decode_of_an_unknown_state_code_does_not_invent_a_state():
    d = decode("00AAPFU0939F1ZV")
    assert d is not None
    assert d.state_name is None


def test_decode_of_a_non_gstin_is_none():
    assert decode("Unregistered") is None


# ---------------------------------------------------------------- settlement


class _Result:
    def __init__(self, row):
        self._row = row

    def mappings(self):
        return self

    def first(self):
        return self._row


class _Session:
    """Answers the SELECT with one invoice row and records every UPDATE."""

    def __init__(self, invoice):
        self.invoice = invoice
        self.updates = []

    async def execute(self, stmt, params=None):
        sql = str(stmt)
        if sql.lstrip().upper().startswith("SELECT"):
            return _Result(self.invoice)
        self.updates.append((sql, params))
        return _Result(None)


def invoice(grand_total, amount_paid="0", status="Posted"):
    return {
        "id": uuid4(),
        "grand_total": Decimal(grand_total),
        "amount_paid": Decimal(amount_paid),
        "status": status,
    }


@pytest.mark.asyncio
async def test_a_partial_payment_is_applied_not_treated_as_settlement():
    from app.api.v1.vouchers import settle_invoice

    inv = invoice("1000000.00")
    db = _Session(inv)
    got = await settle_invoice(db, "purchase_invoices", "c1", 1, invoice_id=inv["id"])

    assert got == inv["id"]
    assert len(db.updates) == 1
    sql, params = db.updates[0]
    assert "amount_paid = amount_paid + :amt" in sql
    assert params["amt"] == Decimal("1")
    # The status is derived in SQL from the running total, not asserted.
    assert "'Partial'" in sql and "'Paid'" in sql and "'Unpaid'" in sql


@pytest.mark.asyncio
async def test_paying_more_than_is_outstanding_is_refused():
    from app.api.v1.vouchers import settle_invoice

    inv = invoice("1000.00", amount_paid="400.00")
    db = _Session(inv)
    with pytest.raises(HTTPException) as exc:
        await settle_invoice(db, "sales_invoices", "c1", 600.01, invoice_id=inv["id"])
    assert exc.value.status_code == 409
    assert "exceeds" in exc.value.detail
    assert db.updates == [], "nothing may be written when the amount is refused"


@pytest.mark.asyncio
async def test_paying_exactly_the_balance_is_fine():
    from app.api.v1.vouchers import settle_invoice

    inv = invoice("1000.00", amount_paid="400.00")
    db = _Session(inv)
    await settle_invoice(db, "sales_invoices", "c1", 600.00, invoice_id=inv["id"])
    assert len(db.updates) == 1


@pytest.mark.asyncio
async def test_a_cancelled_invoice_cannot_be_paid_against():
    from app.api.v1.vouchers import settle_invoice

    inv = invoice("1000.00", status="Cancelled")
    db = _Session(inv)
    with pytest.raises(HTTPException) as exc:
        await settle_invoice(db, "sales_invoices", "c1", 100, invoice_id=inv["id"])
    assert exc.value.status_code == 409
    assert db.updates == []


@pytest.mark.asyncio
async def test_an_on_account_receipt_names_no_invoice_and_touches_none():
    from app.api.v1.vouchers import settle_invoice

    db = _Session(invoice("1000.00"))
    assert await settle_invoice(db, "sales_invoices", "c1", 100) is None
    assert db.updates == []


@pytest.mark.asyncio
async def test_a_named_invoice_that_is_not_ours_is_404_not_silently_skipped():
    from app.api.v1.vouchers import settle_invoice

    db = _Session(None)  # the company-scoped SELECT finds nothing
    with pytest.raises(HTTPException) as exc:
        await settle_invoice(db, "sales_invoices", "c1", 100, invoice_id=uuid4())
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_a_reference_number_matching_nothing_is_on_account():
    """A free-text reference that matches no bill is not an error: it is a
    receipt on account, and the caller gets None rather than a 404."""
    from app.api.v1.vouchers import settle_invoice

    db = _Session(None)
    assert await settle_invoice(db, "sales_invoices", "c1", 100, reference_no="ADV-001") is None
