"""Integration tests against a real PostgreSQL server.

Everything else in this suite runs against a stub session, because for most of
the effort no database was available. These exercise the schema itself: that
the migrations apply, that the constraints reject what they are supposed to,
that the audit trigger fires and cannot be tampered with, and that document
numbering survives concurrent callers.

Skipped unless a server is reachable. Point them at a scratch database:

    docker run -d --name pg -e POSTGRES_USER=verify -e POSTGRES_PASSWORD=verify \\
        -e POSTGRES_DB=caratloop_verify -p 5442:5432 postgres:16-alpine

    set TEST_DATABASE_URL=postgresql+psycopg2://verify:verify@localhost:5442/caratloop_verify
    pytest tests/test_migrations_integration.py

Never point this at a database you care about: it runs `alembic downgrade base`.
"""

from __future__ import annotations

import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DB_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DB_URL, reason="TEST_DATABASE_URL not set; integration tests need a live server"
)

sqlalchemy = pytest.importorskip("sqlalchemy")
from sqlalchemy import create_engine, text  # noqa: E402


def _alembic(*args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ, ALEMBIC_DATABASE_URL=DB_URL or "", PYTHONIOENCODING="utf-8")
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=300,
    )


@pytest.fixture(scope="module")
def engine():
    """Rebuild the schema from scratch, once, for this module."""
    eng = create_engine(DB_URL, future=True)
    with eng.begin() as c:
        c.execute(text("DROP SCHEMA IF EXISTS caratloop CASCADE"))
        c.execute(text("DROP TABLE IF EXISTS public.alembic_version"))

    result = _alembic("upgrade", "head")
    assert result.returncode == 0, f"alembic upgrade failed:\n{result.stderr}"

    yield eng
    eng.dispose()


@pytest.fixture()
def company(engine):
    """A company, which the 0007 trigger provisions accounts for."""
    with engine.begin() as c:
        cid = c.execute(
            text(
                "INSERT INTO caratloop.companies (legal_name, state_code) "
                "VALUES ('Test Co', '08') RETURNING id"
            )
        ).scalar()
        fy = c.execute(
            text(
                "INSERT INTO caratloop.fiscal_years "
                "(company_id, year_label, start_date, end_date, is_active) "
                "VALUES (:cid, '2026-27', '2026-04-01', '2027-03-31', TRUE) RETURNING id"
            ),
            {"cid": cid},
        ).scalar()
    return {"id": cid, "fy": fy}


# ── schema shape ──────────────────────────────────────────────────────────

def test_migrations_apply_cleanly(engine):
    with engine.connect() as c:
        n = c.execute(
            text(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema='caratloop'"
            )
        ).scalar()
    assert n >= 30, f"expected the full schema, found {n} tables"


def test_no_money_column_uses_a_float_type(engine):
    with engine.connect() as c:
        offenders = c.execute(
            text(
                "SELECT table_name || '.' || column_name "
                "FROM information_schema.columns "
                "WHERE table_schema='caratloop' "
                "  AND data_type IN ('double precision','real') "
                "  AND column_name ~ 'amount|total|value|charge|credit|debit|balance|rate'"
            )
        ).scalars().all()
    assert not offenders, f"money columns using a float type: {offenders}"


# ── constraints ───────────────────────────────────────────────────────────

def test_stock_direction_rejects_the_wrong_convention(engine, company):
    """Writers store 'I'/'O'. A report once filtered 'IN'/'OUT' and read zero."""
    from sqlalchemy.exc import DBAPIError

    with engine.begin() as c:
        mid = c.execute(
            text(
                "INSERT INTO caratloop.materials (company_id, code, name, category) "
                "VALUES (:cid, 'M-DIR', 'Gold', 'Gold') RETURNING id"
            ),
            {"cid": company["id"]},
        ).scalar()

    with pytest.raises(DBAPIError):
        with engine.begin() as c:
            c.execute(
                text(
                    "INSERT INTO caratloop.stock_ledger_entries "
                    "(company_id, material_id, entry_date, direction, quantity) "
                    "VALUES (:cid, :mid, CURRENT_DATE, 'IN', 1)"
                ),
                {"cid": company["id"], "mid": mid},
            )


def test_purity_rejects_millesimal(engine, company):
    """Fine weight is net * purity, so 916 would inflate a weight 1000-fold."""
    from sqlalchemy.exc import DBAPIError

    with engine.begin() as c:
        mid = c.execute(
            text(
                "INSERT INTO caratloop.materials (company_id, code, name, category) "
                "VALUES (:cid, 'M-PUR', 'Gold', 'Gold') RETURNING id"
            ),
            {"cid": company["id"]},
        ).scalar()

    with pytest.raises(DBAPIError):
        with engine.begin() as c:
            c.execute(
                text(
                    "INSERT INTO caratloop.stock_ledger_entries "
                    "(company_id, material_id, entry_date, direction, quantity, purity) "
                    "VALUES (:cid, :mid, CURRENT_DATE, 'I', 1, 916)"
                ),
                {"cid": company["id"], "mid": mid},
            )


def test_journal_line_cannot_be_both_debit_and_credit(engine, company):
    from sqlalchemy.exc import IntegrityError

    with engine.begin() as c:
        je = c.execute(
            text(
                "INSERT INTO caratloop.journal_entries "
                "(company_id, fiscal_year_id, entry_no, entry_date, entry_type) "
                "VALUES (:cid, :fy, 'JV/T/1', CURRENT_DATE, 'Journal') RETURNING id"
            ),
            {"cid": company["id"], "fy": company["fy"]},
        ).scalar()
        acc = c.execute(
            text(
                "SELECT id FROM caratloop.accounts "
                "WHERE company_id=:cid AND code='CRD-001'"
            ),
            {"cid": company["id"]},
        ).scalar()

    with pytest.raises(IntegrityError):
        with engine.begin() as c:
            c.execute(
                text(
                    "INSERT INTO caratloop.journal_entry_lines "
                    "(journal_entry_id, account_id, dr_amount, cr_amount) "
                    "VALUES (:je, :acc, 100, 100)"
                ),
                {"je": je, "acc": acc},
            )


def test_duplicate_invoice_number_is_rejected(engine, company):
    """COUNT(*)+1 numbering raced across workers and minted duplicates."""
    from sqlalchemy.exc import IntegrityError

    with engine.begin() as c:
        acc = c.execute(
            text("SELECT id FROM caratloop.accounts WHERE company_id=:cid AND code='CRD-001'"),
            {"cid": company["id"]},
        ).scalar()
        cust = c.execute(
            text(
                "INSERT INTO caratloop.parties "
                "(company_id, account_id, party_type, name, party_code) "
                "VALUES (:cid, :acc, 'Customer', 'Buyer', 'C-1') RETURNING id"
            ),
            {"cid": company["id"], "acc": acc},
        ).scalar()
        c.execute(
            text(
                "INSERT INTO caratloop.sales_invoices "
                "(company_id, fiscal_year_id, customer_id, invoice_no, invoice_date, place_of_supply) "
                "VALUES (:cid, :fy, :cust, 'CL/2026-27/00001', CURRENT_DATE, '08')"
            ),
            {"cid": company["id"], "fy": company["fy"], "cust": cust},
        )

    with pytest.raises(IntegrityError):
        with engine.begin() as c:
            c.execute(
                text(
                    "INSERT INTO caratloop.sales_invoices "
                    "(company_id, fiscal_year_id, customer_id, invoice_no, invoice_date, place_of_supply) "
                    "VALUES (:cid, :fy, :cust, 'CL/2026-27/00001', CURRENT_DATE, '08')"
                ),
                {"cid": company["id"], "fy": company["fy"], "cust": cust},
            )


# ── audit trail ───────────────────────────────────────────────────────────

def test_audit_trigger_records_the_session_context(engine, company):
    """app/core/audit.py set these variables for a function that did not exist."""
    with engine.begin() as c:
        user = c.execute(
            text(
                "INSERT INTO caratloop.users "
                "(company_id, email, password_hash, full_name, role) "
                "VALUES (:cid, 'audit@test.local', '$2b$12$x', 'A', 'Admin') RETURNING id"
            ),
            {"cid": company["id"]},
        ).scalar()

        c.execute(
            text(
                "SELECT set_config('app.user_id', :uid, true), "
                "       set_config('app.reason', 'integration test', true), "
                "       set_config('app.ip_address', '10.1.2.3', true)"
            ),
            {"uid": str(user)},
        )
        c.execute(
            text(
                "INSERT INTO caratloop.materials (company_id, code, name, category) "
                "VALUES (:cid, 'M-AUDIT', 'Silver', 'Silver')"
            ),
            {"cid": company["id"]},
        )

    with engine.connect() as c:
        row = c.execute(
            text(
                "SELECT user_id, reason, ip_address, row_hash FROM caratloop.audit_log "
                "WHERE reason = 'integration test' ORDER BY id DESC LIMIT 1"
            )
        ).mappings().first()

    assert row is not None, "the audit trigger recorded nothing"
    assert row["user_id"] is not None
    assert row["ip_address"] is not None
    assert row["row_hash"]


@pytest.mark.parametrize("statement", [
    "UPDATE caratloop.audit_log SET reason='tampered' WHERE id=(SELECT min(id) FROM caratloop.audit_log)",
    "DELETE FROM caratloop.audit_log WHERE id=(SELECT min(id) FROM caratloop.audit_log)",
])
def test_audit_log_is_append_only(engine, company, statement):
    from sqlalchemy.exc import DBAPIError

    with pytest.raises(DBAPIError) as exc:
        with engine.begin() as c:
            c.execute(text(statement))
    assert "append-only" in str(exc.value)


# ── document numbering ────────────────────────────────────────────────────

def test_numbering_is_sequential_and_gap_free(engine, company):
    with engine.connect() as c:
        got = [
            c.execute(
                text("SELECT caratloop.next_document_number(:cid, :fy, 'SeqTest')"),
                {"cid": company["id"], "fy": company["fy"]},
            ).scalar()
            for _ in range(5)
        ]
        c.commit()
    assert got == [1, 2, 3, 4, 5]


def test_numbering_survives_concurrent_callers(engine, company):
    """The original COUNT(*)+1 handed the same number to simultaneous callers."""
    def allocate(_):
        with engine.begin() as c:
            return c.execute(
                text("SELECT caratloop.next_document_number(:cid, :fy, 'RaceTest')"),
                {"cid": company["id"], "fy": company["fy"]},
            ).scalar()

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(allocate, range(8)))

    assert len(set(results)) == 8, f"duplicate numbers allocated: {sorted(results)}"
    assert sorted(results) == list(range(1, 9))


# ── provisioning ──────────────────────────────────────────────────────────

def test_a_new_company_gets_its_chart_of_accounts(engine):
    """On an empty install the 0003 seed creates nothing, because it
    cross-joins companies. Without the 0007 trigger the first sale fails with
    'Chart of accounts is missing SAL-001'."""
    with engine.begin() as c:
        cid = c.execute(
            text(
                "INSERT INTO caratloop.companies (legal_name, state_code) "
                "VALUES ('Brand New Co', '27') RETURNING id"
            )
        ).scalar()
        codes = set(
            c.execute(
                text("SELECT code FROM caratloop.accounts WHERE company_id=:cid"),
                {"cid": cid},
            ).scalars().all()
        )

    required = {
        "SAL-001", "SAL-003", "SAL-004", "COGS-001", "MFG-LOSS",
        "STK-001", "GST-001", "ITC-004", "RCM-001", "CRD-001", "PUR-001",
    }
    assert required <= codes, f"missing on a new company: {sorted(required - codes)}"
