"""Booking a voucher from a statement line, and suggesting matches by amount.

Reconciling meant leaving the screen to key a voucher with the same date and
amount, then coming back to pair it. POST /banking/statement/{id}/book does
the whole thing; GET /banking/reconciliation/suggestions pairs what already
agrees on amount so the obvious matches take one click.
"""

from __future__ import annotations

import io
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.v1.banking import _booking_plan, _pair_suggestions

ROOT = Path(__file__).resolve().parents[1]
SRC = io.open(ROOT / "app" / "api" / "v1" / "banking.py", encoding="utf-8").read()


def test_statement_credit_is_a_receipt_and_debit_a_payment():
    assert _booking_plan(None, "4100.00") == ("Receipt", "REC", Decimal("4100.00"))
    assert _booking_plan("29500", 0) == ("Payment", "PAY", Decimal("29500"))


@pytest.mark.parametrize("debit,credit", [(0, 0), (None, None), ("100", "100")])
def test_a_line_with_both_or_neither_amount_cannot_be_booked(debit, credit):
    with pytest.raises(HTTPException) as exc:
        _booking_plan(debit, credit)
    assert exc.value.status_code == 422


def _bank(id_, d, debit=0, credit=0, desc=""):
    return {"id": id_, "txn_date": d, "debit": Decimal(str(debit)), "credit": Decimal(str(credit)), "description": desc}


def _book(id_, d, dr=0, cr=0, no="JV/1"):
    return {"id": id_, "entry_date": d, "dr_amount": Decimal(str(dr)), "cr_amount": Decimal(str(cr)), "entry_no": no, "narration": ""}


def test_suggestions_pair_equal_amounts_in_the_right_direction():
    bank = [_bank("b1", date(2026, 5, 7), debit=29500), _bank("b2", date(2026, 4, 28), credit=20478)]
    book = [_book(1, date(2026, 5, 6), cr=29500, no="PAY/1"), _book(2, date(2026, 4, 28), dr=20478, no="REC/1"),
            _book(3, date(2026, 4, 28), cr=20478, no="PAY/2")]  # same amount, wrong side: not a candidate
    pairs = _pair_suggestions(bank, book)
    assert {(p["bank_entry_id"], p["book_entry_id"]) for p in pairs} == {("b1", 1), ("b2", 2)}
    assert [p["days_apart"] for p in sorted(pairs, key=lambda p: p["bank_entry_id"])] == [1, 0]


def test_suggestions_are_one_to_one_and_prefer_the_nearest_date():
    bank = [_bank("b1", date(2026, 6, 1), credit=1000), _bank("b2", date(2026, 6, 10), credit=1000)]
    book = [_book(1, date(2026, 6, 9), dr=1000), _book(2, date(2026, 6, 2), dr=1000)]
    pairs = {p["bank_entry_id"]: p["book_entry_id"] for p in _pair_suggestions(bank, book)}
    assert pairs == {"b1": 2, "b2": 1}


def test_suggestions_respect_the_day_window():
    bank = [_bank("b1", date(2026, 6, 1), credit=500)]
    book = [_book(1, date(2026, 6, 20), dr=500)]
    assert _pair_suggestions(bank, book, max_days=5) == []
    assert len(_pair_suggestions(bank, book, max_days=30)) == 1


def test_endpoint_posts_through_the_voucher_path_and_records_the_match():
    assert '@router.post("/statement/{line_id}/book"' in SRC
    assert "post_journal(" in SRC and "settle_invoice(" in SRC
    assert "assert_period_open(db, company_id, line[\"txn_date\"]" in SRC
    # numbering from the shared sequence, never a count
    assert "LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')" in SRC
    # the manual match and the booking share one writer, so both leave the same trail
    assert SRC.count("await _record_match(") >= 2
    assert "FOR UPDATE" in SRC.split('@router.post("/statement/{line_id}/book"')[1].split("@router.get")[0]


def test_bank_and_contra_can_never_be_the_same_account():
    body = SRC.split('@router.post("/statement/{line_id}/book"')[1]
    assert "cannot be the bank account itself" in body


def test_suggestions_endpoint_widens_the_book_window_by_the_day_tolerance():
    body = SRC.split('@router.get("/reconciliation/suggestions")')[1]
    assert "start_d - pad" in body and "end_d + pad" in body
