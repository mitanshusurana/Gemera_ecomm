"""String literals the application writes must be values its CHECK permits.

Three separate columns carry a fixed vocabulary, and the application had
drifted from all three:

  users.role                          three values it could never store, four
                                      it never used -- the owner of the
                                      business was refused every endpoint
  parties.party_type                  the whole interface says "Supplier",
                                      which the CHECK forbids, so creating one
                                      returned 500 and the supplier dropdown
                                      was empty
  stock_ledger_entries.transaction_type
                                      JobWork_Issue, JobWork_Receipt and
                                      Sale_Return are not in the CHECK, so job
                                      work in both directions and every sales
                                      cancellation failed

None of these is visible until someone exercises the endpoint. This reads the
permitted values out of the migrations and the written values out of the
application, offline, and compares them.
"""

from __future__ import annotations

import ast
import io
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
SQL = ROOT / "migrations" / "sql"


def _sql_text() -> str:
    return "\n".join(io.open(f, encoding="utf-8").read() for f in sorted(SQL.glob("*.sql")))


def permitted(constraint: str) -> set[str]:
    """The literals a named CHECK constraint accepts."""
    sql = _sql_text()
    m = re.search(
        rf"CONSTRAINT\s+{re.escape(constraint)}\s+CHECK\s*\((.*?)\)\s*\)\s*\)",
        sql,
        re.I | re.S,
    )
    assert m, f"{constraint} is not in the migrations"
    values = set(re.findall(r"'([A-Za-z_][A-Za-z0-9_]*)'::character varying", m.group(1)))
    assert values, f"could not read any value out of {constraint}"
    return values


def _strip_sql_comments(sql: str) -> str:
    """Drop -- comments so prose about a rejected value is not read as a use.

    A comment explaining why 'Sales Reversal' is wrong would otherwise be
    reported as writing it.
    """
    out = []
    for line in sql.split("\n"):
        in_str = False
        cut = None
        i = 0
        while i < len(line):
            ch = line[i]
            if ch == "'":
                if in_str and i + 1 < len(line) and line[i + 1] == "'":
                    i += 2
                    continue
                in_str = not in_str
            elif ch == "-" and not in_str and line[i:i + 2] == "--":
                cut = i
                break
            i += 1
        out.append(line[:cut] if cut is not None else line)
    return "\n".join(out)


def sql_literals():
    """(file, line, sql) for every text() literal in the application."""
    for f in sorted(APP.rglob("*.py")):
        if "__pycache__" in str(f):
            continue
        try:
            tree = ast.parse(io.open(f, encoding="utf-8").read())
        except SyntaxError:  # pragma: no cover
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
            if name != "text" or not node.args:
                continue
            arg = node.args[0]
            if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                yield (
                    f.relative_to(ROOT).as_posix(),
                    node.lineno,
                    _strip_sql_comments(arg.value),
                )


def test_the_extractor_reads_the_constraints():
    """A silent extraction failure would make every test below vacuous."""
    assert "store_keeper" in permitted("chk_user_role")
    assert "Vendor" in permitted("chk_party_type")
    assert "Job_Work_Out" in permitted("chk_sle_transaction_type")


def test_role_constants_are_all_permitted():
    from app.core.roles import ALL_ROLES

    assert ALL_ROLES == permitted("chk_user_role")


def test_party_type_aliases_all_map_onto_permitted_values():
    from app.api.v1.parties import PARTY_TYPE_ALIASES

    allowed = permitted("chk_party_type")
    bad = {k: v for k, v in PARTY_TYPE_ALIASES.items() if v not in allowed}
    assert not bad, f"aliases mapping onto values the CHECK forbids: {bad}"


def test_every_stock_transaction_type_written_is_permitted():
    """Catches JobWork_Issue, JobWork_Receipt and Sale_Return."""
    allowed = permitted("chk_sle_transaction_type")

    # Words that look like a transaction type but name something else in these
    # statements: source_document_type values and table/column fragments.
    NOT_A_TRANSACTION_TYPE = {
        "SalesInvoice", "PurchaseInvoice", "JobWorkChallan", "JobWorkReceipt",
        "ProductionOrder", "Opening_Stock",
    }

    offenders = []
    for path, lineno, sql in sql_literals():
        if "stock_ledger_entries" not in sql:
            continue
        for word in re.findall(r"'([A-Z][A-Za-z]+(?:_[A-Za-z]+)+)'", sql):
            if word in NOT_A_TRANSACTION_TYPE or word in allowed:
                continue
            offenders.append(f"{path}:{lineno} writes '{word}'")

    assert not offenders, (
        "stock ledger transaction types the CHECK rejects:\n  "
        + "\n  ".join(sorted(set(offenders)))
        + f"\n\npermitted: {', '.join(sorted(allowed))}"
    )


def test_every_journal_entry_type_written_is_permitted():
    """Catches 'Sales Reversal', which chk_je_type rejects.

    Cancelling a sales invoice built its reversal entry with that value, so
    every cancellation failed at the database after the stock and GST legs had
    already been written -- the whole transaction rolled back, but only after
    the endpoint had done all its work.
    """
    allowed = permitted("chk_je_type")

    # Words in these statements that are not the entry_type: reference_type
    # values, statuses, and prose inside a narration.
    NOT_AN_ENTRY_TYPE = {
        "SalesInvoice", "PurchaseInvoice", "ProductionOrder", "JobWorkChallan",
        "Posted", "Draft", "Cancelled",
    }

    offenders = []
    for path, lineno, sql in sql_literals():
        if "INSERT INTO caratloop.journal_entries" not in sql:
            continue
        for word in re.findall(r"'([A-Z][A-Za-z]*(?:[ _][A-Za-z]+)*)'", sql):
            w = word.strip()
            if not w or w in NOT_AN_ENTRY_TYPE or w in allowed:
                continue
            # Narration fragments end with a space before concatenation.
            if word.endswith(" "):
                continue
            offenders.append(f"{path}:{lineno} writes entry_type '{w}'")

    assert not offenders, (
        "journal entry types the CHECK rejects:\n  "
        + "\n  ".join(sorted(set(offenders)))
        + f"\n\npermitted: {', '.join(sorted(allowed))}"
    )
