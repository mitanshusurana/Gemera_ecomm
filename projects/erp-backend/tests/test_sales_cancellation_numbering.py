"""Cancelling an invoice posts a reversal journal; its number must come from the
same sequence as every other JV/ number, or the first cancellation collides
with the invoice's own voucher (seen live: 500 on cancel)."""
from pathlib import Path

SRC = (Path(__file__).resolve().parents[1] / "app" / "api" / "v1" / "sales.py").read_text(encoding="utf-8")


def test_reversal_number_uses_the_shared_journal_sequence():
    assert "next_document_number(:cid, NULL, 'JournalVoucher')" not in SRC
    assert SRC.count("NEXTVAL('caratloop.journal_entry_seq')") >= 2
