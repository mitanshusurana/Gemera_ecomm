"""Gapless bill numbers, TDS sections, split bank matches, 2B bill links."""

import io
from pathlib import Path

from app.api.v1.banking import MatchPayload

ROOT = Path(__file__).resolve().parents[1]
PUR = io.open(ROOT / "app" / "api" / "v1" / "purchases.py", encoding="utf-8").read()
BANK = io.open(ROOT / "app" / "api" / "v1" / "banking.py", encoding="utf-8").read()
G2B = io.open(ROOT / "app" / "api" / "v1" / "gstr2b.py", encoding="utf-8").read()
SQL13 = io.open(ROOT / "migrations" / "sql" / "0013_split_bank_matches.sql", encoding="utf-8").read()


def test_bill_numbers_continue_from_the_highest_used_not_the_shared_sequence():
    assert "async def next_bill_no(" in PUR
    assert "pg_advisory_xact_lock" in PUR
    assert "SUBSTRING(bill_no FROM '^PI/[^/]+/([0-9]+)')" in PUR
    # no caller of the purchase bill number uses the shared sequence any more
    assert "'PI/' || :fy || '/' || LPAD(NEXTVAL" not in PUR
    assert "'PI/' || :fy || '/' || LPAD(NEXTVAL" not in G2B
    assert "next_bill_no(db, company_id, fy" in G2B


def test_tds_override_posts_to_the_sections_own_payable_account():
    assert "tds_override: Optional[\"TdsOverride\"] = None" in PUR
    assert 'tds_code = f"TDS-{tds.section}"' in PUR
    assert "TDS Payable s.{tds.section}" in PUR
    assert "'TDS-194Q' AND a.company_id" not in PUR     # the hard-coded account is gone


def test_match_payload_accepts_one_or_several_book_lines():
    assert MatchPayload(book_entry_id=5, bank_entry_id="4c6a0f7e-1111-4222-8333-444455556666").line_ids() == [5]
    assert MatchPayload(book_entry_ids=[7, 8], bank_entry_id="4c6a0f7e-1111-4222-8333-444455556666").line_ids() == [7, 8]
    assert MatchPayload(book_entry_id=7, book_entry_ids=[7, 8], bank_entry_id="4c6a0f7e-1111-4222-8333-444455556666").line_ids() == [7, 8]


def test_split_match_checks_the_sum_and_unmatch_returns_every_pair():
    assert "The selected book entries add up to" in BANK
    assert "flag_bank=False" in BANK and "await _flag_bank_line(" in BANK
    assert "for pair in (pairs or [m]):" in BANK
    assert "DROP INDEX IF EXISTS caratloop.ux_reconciliation_matches_bank_entry" in SQL13


def test_2b_books_side_carries_the_bill_id_for_linking():
    assert "ir.invoice_id, p.name AS vendor_name" in G2B
    assert '"invoice_id": str(b["invoice_id"])' in G2B
