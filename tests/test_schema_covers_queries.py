"""Guard against schema drift.

The application talks to the database in raw SQL, so nothing links a query to
the migration that must support it. A table renamed in one and not the other
fails only at runtime, in production, on the endpoint nobody exercised.

These tests parse every ``caratloop.<name>`` reference out of the source and
assert the migrations create it. That is how the missing
``journal_entries_id_seq`` was found: production completion referenced a
sequence no migration created, so the endpoint could never have run.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
MIGRATIONS = ROOT / "migrations" / "versions"

# Negative lookbehind for "@" so the domain in admin@caratloop.com is not
# mistaken for a relation named "com".
REF_RE = re.compile(r"(?<!@)caratloop\.([a-z_][a-z0-9_]*)", re.I)
CREATE_TABLE_RE = re.compile(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?caratloop\.([a-z_]\w*)", re.I)
CREATE_SEQ_RE = re.compile(r"CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?caratloop\.([a-z_]\w*)", re.I)
CREATE_FN_RE = re.compile(r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+caratloop\.([a-z_]\w*)", re.I)
SERIAL_RE = re.compile(r"^\s*(\w+)\s+BIGSERIAL", re.I | re.M)

# Referenced in SQL but not a relation the migration must create.
IMPLICIT: set[str] = set()


def _source_text() -> str:
    parts = []
    for f in APP.rglob("*.py"):
        if "__pycache__" in str(f):
            continue
        parts.append(io.open(f, encoding="utf-8").read())
    return "\n".join(parts)


def _migration_text() -> str:
    """The Python wrappers plus the SQL they execute.

    After the merge with the legacy baseline the DDL lives in
    migrations/sql/*.sql and the .py files are thin wrappers. Reading only the
    .py files made every account-code assertion pass against an empty haystack.
    """
    parts = [io.open(f, encoding="utf-8").read() for f in sorted(MIGRATIONS.glob("*.py"))]
    sql_dir = ROOT / "migrations" / "sql"
    parts += [io.open(f, encoding="utf-8").read() for f in sorted(sql_dir.glob("*.sql"))]
    return "\n".join(parts)


def _created_objects(mig: str) -> set[str]:
    created = set(CREATE_TABLE_RE.findall(mig))
    created |= set(CREATE_SEQ_RE.findall(mig))
    created |= set(CREATE_FN_RE.findall(mig))

    # BIGSERIAL columns implicitly create "<table>_<column>_seq".
    for table_match in CREATE_TABLE_RE.finditer(mig):
        table = table_match.group(1)
        tail = mig[table_match.end():]
        end = tail.find(");")
        body = tail[:end] if end != -1 else tail
        for col in SERIAL_RE.findall(body):
            created.add(f"{table}_{col}_seq")

    return {c.lower() for c in created}


def test_every_referenced_table_exists_in_migrations():
    src = _source_text()
    created = _created_objects(_migration_text())

    referenced = {r.lower() for r in REF_RE.findall(src)}
    # Strip references that are column-qualified aliases rather than relations.
    referenced = {r for r in referenced if not r.startswith("fn_")}

    missing = sorted(referenced - created - IMPLICIT)

    assert not missing, (
        "SQL references relations that no migration creates: "
        + ", ".join(missing)
    )


def test_audit_trigger_function_is_defined():
    """app/core/audit.py sets session vars for a function that must exist."""
    mig = _migration_text()
    assert "fn_audit_trigger" in mig
    # The baseline reads the same session variables and additionally chains
    # rows with prev_hash, which the reconstruction's version did not.
    assert "app.user_id" in mig
    assert "app.reason" in mig
    assert "prev_hash" in mig


def test_audit_log_is_append_only():
    mig = _migration_text()
    assert "trg_audit_log_no_update" in mig
    assert "trg_audit_log_no_delete" in mig


def test_money_columns_are_numeric_not_float():
    """A float column would defeat the Decimal work upstream."""
    mig = _migration_text()
    offenders = re.findall(
        r"^\s*(\w*(?:amount|total|value|charges|credit|debit|balance|rate)\w*)\s+"
        r"(DOUBLE\s+PRECISION|REAL|FLOAT)",
        mig,
        re.I | re.M,
    )
    assert not offenders, f"money-ish columns using a float type: {offenders}"


def test_stock_direction_is_constrained_to_the_convention():
    """Writers store 'I'/'O'; a report once filtered on 'IN'/'OUT' and read zero."""
    mig = _migration_text()
    # The baseline's own name, and its form: ANY (ARRAY[...]) rather than IN.
    assert "chk_sle_direction" in mig
    assert "'I'" in mig and "'O'" in mig


def test_invoice_numbering_is_unique_per_year():
    """COUNT(*)+1 numbering races across the four uvicorn workers."""
    mig = _migration_text()
    # uq_sales_invoice_no is the baseline's name for the same constraint.
    assert "uq_sales_invoice_no" in mig
    assert "company_id, fiscal_year_id, invoice_no" in mig


def test_journal_lines_cannot_be_double_sided():
    """The baseline's chk_jel_debit_credit is stricter than the reconstruction's.

    It requires exactly one side to be non-zero; the reconstruction only
    forbade both being positive, which allowed a line that was zero on both.
    """
    mig = _migration_text()
    assert "chk_jel_debit_credit" in mig


@pytest.mark.parametrize("code", [
    "SAL-001", "SAL-003", "SAL-005",
    "GST-001", "GST-002", "GST-003", "GST-004", "GST-005", "GST-006",
    "ITC-001", "ITC-002", "ITC-003", "ITC-004",
    "RCM-001", "RCM-002",
    "CRD-001", "PUR-001", "MFG-002",
    "STK-001", "STK-003", "STK-004", "STK-005",
    "STK-006", "STK-007", "STK-008", "STK-009",
    "COGS-001",
])
def test_every_hardcoded_account_code_is_seeded(code):
    """A missing code made INSERT...SELECT insert zero rows, silently."""
    assert code in _migration_text(), (
        f"account code {code} is referenced in application SQL but never seeded"
    )


def test_role_vocabulary_matches_the_database_check():
    """Every role the code names must be one the users.role CHECK permits.

    These two lists drifted apart completely: the code knew superadmin,
    storekeeper and viewer -- none of which the CHECK allows, so no user could
    ever hold them -- and did not know owner, production_manager, store_keeper
    or read_only, which are the values it does allow. Since auth.py issues the
    token straight from the stored row, an owner matched no permission group
    and was refused every posting and amendment endpoint in the application.
    """
    from app.core.roles import ALL_ROLES

    mig = _migration_text()
    match = re.search(
        r"CONSTRAINT\s+chk_user_role\s+CHECK\s*\((.*?)\)\s*\)\s*\)", mig, re.I | re.S
    )
    assert match, "chk_user_role is not in the migrations"
    permitted = {v.lower() for v in re.findall(r"'([a-z_]+)'::character varying", match.group(1))}
    assert permitted, "could not read the permitted roles out of chk_user_role"

    assert ALL_ROLES == permitted, (
        f"roles.py and the database disagree; "
        f"code-only={sorted(ALL_ROLES - permitted)}, "
        f"database-only={sorted(permitted - ALL_ROLES)}"
    )


def test_every_role_can_do_something():
    """A role in the CHECK that appears in no permission group is a lockout."""
    from app.core import roles

    groups = (
        roles.CAN_POST | roles.CAN_MOVE_STOCK
        | roles.CAN_AMEND | roles.CAN_READ_FULL_AUDIT
    )
    # read_only is deliberately in no group: it reads, it does not act.
    orphans = roles.ALL_ROLES - groups - {roles.READ_ONLY}
    assert not orphans, f"roles that can do nothing: {sorted(orphans)}"
