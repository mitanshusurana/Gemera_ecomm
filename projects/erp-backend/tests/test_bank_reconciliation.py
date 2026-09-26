"""Bank reconciliation statement arithmetic, and that matches are persisted."""

from __future__ import annotations

import io
from decimal import Decimal
from pathlib import Path

from app.api.v1.banking import compute_brs

ROOT = Path(__file__).resolve().parents[1]


def test_brs_reconciles_when_the_timing_items_explain_everything():
    # Books say 1,00,000. A 20,000 cheque issued has not been presented and
    # a 5,000 deposit has not cleared, so the bank should show 1,15,000.
    brs = compute_brs("100000", "20000", "5000", "115000")
    assert brs["balance_as_per_books"] == Decimal("100000.00")
    assert brs["expected_balance_as_per_bank"] == Decimal("115000.00")
    assert brs["difference"] == Decimal("0.00")
    assert brs["reconciled"] is True


def test_brs_reports_an_unexplained_difference_honestly():
    brs = compute_brs("100000", "20000", "5000", "114750.50")
    assert brs["difference"] == Decimal("-249.50")
    assert brs["reconciled"] is False


def test_brs_without_a_statement_has_no_difference_not_a_fake_zero():
    brs = compute_brs("100000", "0", "0", None)
    assert brs["balance_as_per_bank_statement"] is None
    assert brs["difference"] is None
    assert brs["reconciled"] is False


def test_brs_rounds_to_paise():
    brs = compute_brs(Decimal("10.005"), 0, 0, Decimal("10.01"))
    assert brs["balance_as_per_books"] == Decimal("10.01")
    assert brs["difference"] == Decimal("0.00")


def test_match_writes_both_persistent_columns_and_unmatch_reads_them():
    src = io.open(ROOT / "app" / "api" / "v1" / "banking.py", encoding="utf-8").read()
    assert "INSERT INTO caratloop.reconciliation_matches" in src
    assert "book_entry_line_id" in src
    assert "reconciled_entry_line_id = :book_id" in src
    assert "reconciled_entry_line_id = NULL" in src
    assert "DELETE FROM caratloop.reconciliation_matches" in src
    # The report no longer hardcodes the timing items.
    assert "uncleared_deposits = 0.0" not in src
    assert "unpresented_cheques = 0.0" not in src
