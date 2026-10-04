"""Every journal entry number must be drawn from ``caratloop.journal_entry_seq``.

``uq_journal_entry_no`` is (company_id, fiscal_year_id, entry_no). The posting
path numbers a sales invoice's journal as JV/<fy>/<seq> from that sequence.
The cancellation path once numbered the *reversal* from a different number
space (the per-company 'JournalVoucher' row in document_counters), so on a
fresh company the first invoice posted as JV/2026-27/00001 and its reversal was
computed as JV/2026-27/00001 as well. The INSERT hit the unique constraint and
DELETE /sales/invoices/by-no/... returned 500 for the first invoice of every
year. An earlier revision used COUNT(*)+1 and failed the same way.

The rule this guards: a journal number is minted only by
``NEXTVAL('caratloop.journal_entry_seq')`` inside the SQL, never by a Python
format over a counter, and never from ``next_document_number`` or ``COUNT(*)``.
This reads the application source; no database is needed.
"""

from __future__ import annotations

import ast
import io
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
SALES = APP / "api" / "v1" / "sales.py"

PY_FILES = sorted(p for p in APP.rglob("*.py") if "__pycache__" not in str(p))

SEQ = "NEXTVAL('caratloop.journal_entry_seq')"

# Prefixes that appear as journal_entries.entry_no across the application.
# 'CN/' is excluded: it is also the credit-note document number
# (gst_output_tax_register.cn_no), which is not a journal number.
JOURNAL_PREFIXES = ("JV/", "PUR/", "PI/", "REV/", "REC/", "PAY/")

# A SQL literal that starts an entry number, e.g.  SELECT 'JV/' || :fy || ...
SQL_PREFIX_RE = re.compile(
    r"'(" + "|".join(re.escape(p) for p in JOURNAL_PREFIXES) + r")'\s*\|\|", re.I
)


def _parse(path: Path) -> ast.AST:
    return ast.parse(io.open(path, encoding="utf-8").read())


def _text_calls(tree: ast.AST):
    """Yield (lineno, sql) for every ``text("...")`` with a constant body."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not node.args:
            continue
        name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
        if name != "text":
            continue
        arg = node.args[0]
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            yield node.lineno, arg.value


def _function(tree: ast.AST, name: str) -> ast.AST:
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError(f"{name} not found")


def test_every_sql_minted_journal_number_uses_the_sequence():
    """``'JV/' || ...`` in SQL must be completed by journal_entry_seq, not a bind."""
    bad = []
    seen = 0
    for path in PY_FILES:
        for lineno, sql in _text_calls(_parse(path)):
            if not SQL_PREFIX_RE.search(sql):
                continue
            seen += 1
            if SEQ.lower() not in sql.lower():
                bad.append(f"{path.relative_to(ROOT).as_posix()}:{lineno}")
    assert seen >= 5, f"only {seen} number-minting statements found; the scan may be broken"
    assert not bad, "journal number built in SQL without journal_entry_seq: " + ", ".join(bad)


def test_no_journal_number_is_formatted_in_python():
    """An f-string such as f"JV/{fy}/{cnt:05d}" means the number came from a
    counter the posting path does not use, which is how the collision arose."""
    bad = []
    for path in PY_FILES:
        for node in ast.walk(_parse(path)):
            if not isinstance(node, ast.JoinedStr) or not node.values:
                continue
            head = node.values[0]
            if not (isinstance(head, ast.Constant) and isinstance(head.value, str)):
                continue
            if head.value.startswith(JOURNAL_PREFIXES):
                bad.append(f"{path.relative_to(ROOT).as_posix()}:{node.lineno} {head.value!r}")
    assert not bad, "journal number formatted in Python instead of the sequence: " + ", ".join(bad)


def test_sales_cancellation_reversal_number_comes_from_the_sequence():
    """The reproduced failure: delete_sales_invoice on a one-invoice company."""
    fn = _function(_parse(SALES), "delete_sales_invoice")
    sqls = [sql for _, sql in _text_calls(fn)]

    minting = [s for s in sqls if "'JV/'" in s]
    assert len(minting) == 1, "expected exactly one JV/ allocation in delete_sales_invoice"
    assert SEQ in minting[0]

    for s in sqls:
        assert "next_document_number" not in s, (
            "reversal must not use the document counter: it is a separate number space"
        )
        if "journal_entries" in s and "COUNT(" in s.upper():
            raise AssertionError("reversal number must not be derived from COUNT(*) of journal_entries")


def test_purchase_reversal_number_comes_from_the_sequence():
    """The purchase amendment path reverses the same way; keep it on the sequence."""
    fn = _function(_parse(APP / "api" / "v1" / "purchases.py"), "_reverse_purchase")
    sqls = [sql for _, sql in _text_calls(fn)]
    minting = [s for s in sqls if "'REV/'" in s]
    assert minting, "expected a REV/ allocation in _reverse_purchase"
    assert all(SEQ in s for s in minting)
    assert not any("next_document_number" in s for s in sqls)
