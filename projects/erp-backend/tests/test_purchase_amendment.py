"""Purchase amendment is reverse-and-repost; nothing posted is deleted."""

from __future__ import annotations

import io
import re
from pathlib import Path

from app.api.v1.purchases import INACTIVE_STATUSES, next_amendment_bill_no, root_bill_no

ROOT = Path(__file__).resolve().parents[1]
SRC = io.open(ROOT / "app" / "api" / "v1" / "purchases.py", encoding="utf-8").read()


def test_bill_numbers_chain_from_the_root():
    assert root_bill_no("PI/2026-27/00007") == "PI/2026-27/00007"
    assert root_bill_no("PI/2026-27/00007/A2") == "PI/2026-27/00007"
    assert next_amendment_bill_no("PI/2026-27/00007", 0) == "PI/2026-27/00007/A1"
    assert next_amendment_bill_no("PI/2026-27/00007/A1", 1) == "PI/2026-27/00007/A2"
    assert next_amendment_bill_no("PI/2026-27/00007/A2", 2) == "PI/2026-27/00007/A3"


def test_amendment_never_deletes_posted_rows():
    assert "DELETE FROM" not in SRC


def test_reversal_mirrors_every_posted_table():
    assert "INSERT INTO caratloop.journal_entries" in SRC and "'Reversal'" in SRC
    assert "reversal_of_id" in SRC
    for table in ("itc_register", "rcm_liability_register", "tds_tcs_register", "stock_ledger_entries"):
        assert re.search(rf"INSERT INTO caratloop\.{table}\s*\([^)]*is_reversal", SRC, re.S), table
    assert "'PurchaseAmendment'" in SRC
    assert "THEN 'Adjustment_Out' ELSE 'Adjustment_In'" in SRC


def test_original_is_marked_amended_and_new_row_points_back():
    assert "SET status = 'Amended'" in SRC
    assert "amends_invoice_id" in SRC
    assert set(INACTIVE_STATUSES) == {"Cancelled", "Amended"}


def test_register_readers_net_reversals():
    for name in ("gst.py", "reports.py"):
        src = io.open(ROOT / "app" / "api" / "v1" / name, encoding="utf-8").read()
        assert "is_reversal" in src, name
    gst = io.open(ROOT / "app" / "api" / "v1" / "gst.py", encoding="utf-8").read()
    # Every aggregate over the two registers in gst.py is signed.
    for stmt in re.findall(r"SUM\([^)]*(?:total_itc|total_rcm)[^)]*\)", gst):
        assert "sgn" in stmt or "is_reversal" in stmt or "signed" in stmt, stmt


def test_amended_bills_are_excluded_from_thresholds_and_settlement():
    assert "status NOT IN ('Cancelled', 'Amended')" in SRC
    vouchers = io.open(ROOT / "app" / "api" / "v1" / "vouchers.py", encoding="utf-8").read()
    assert 'inv["status"] == "Amended"' in vouchers
    assert "status NOT IN ('Cancelled', 'Amended')" in vouchers
    reports = io.open(ROOT / "app" / "api" / "v1" / "reports.py", encoding="utf-8").read()
    assert "pi.status NOT IN ('Cancelled', 'Amended')" in reports


def test_amendment_suffix_is_highest_existing_plus_one_not_a_row_count():
    """COUNT(*) over the chain drifted from the real suffixes as soon as a row
    was missing, and the next amendment then collided with uq_purchase_bill_no.
    The suffix must be derived from the bill numbers themselves."""
    import ast, io, re
    from pathlib import Path

    src = io.open(Path(__file__).resolve().parents[1] / "app" / "api" / "v1" / "purchases.py", encoding="utf-8").read()
    tree = ast.parse(src)
    fn = next(n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == "update_purchase_invoice")
    sqls = [
        n.args[0].value for n in ast.walk(fn)
        if isinstance(n, ast.Call) and getattr(n.func, "id", None) == "text"
        and n.args and isinstance(n.args[0], ast.Constant) and isinstance(n.args[0].value, str)
    ]
    chain = [s for s in sqls if "bill_no LIKE :pattern" in s]
    assert len(chain) == 1, "expected exactly one chain lookup in update_purchase_invoice"
    assert "COUNT(" not in chain[0].upper()
    assert re.search(r"MAX\(.*SUBSTRING\(bill_no FROM '/A\(\[0-9\]\+\)\$'\)", chain[0], re.S)

    # A gap in the chain (A1 missing, A2 present) must still yield A3.
    assert next_amendment_bill_no("PI/2026-27/00007/A2", 2) == "PI/2026-27/00007/A3"
