"""Migration 0011: e-invoice documents (credit notes) and the IRN lookup action.

The SQL twin must parse, chain from 0010, create the table the credit-note
endpoints write, widen einvoice_log, and the CHECK vocabularies must be
exactly what app/api/v1/einvoice.py writes.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

from pglast import parse_sql

from tests.test_check_constraint_vocabularies import permitted

ROOT = Path(__file__).resolve().parents[1]
SQL_FILE = ROOT / "migrations" / "sql" / "0011_einvoice_documents.sql"
PY_FILE = ROOT / "migrations" / "versions" / "0011_einvoice_documents.py"


def _sql() -> str:
    return io.open(SQL_FILE, encoding="utf-8").read()


def test_sql_twin_exists_and_parses():
    assert SQL_FILE.exists()
    statements = parse_sql(_sql())
    assert len(statements) >= 7


def test_revision_chain():
    src = io.open(PY_FILE, encoding="utf-8").read()
    assert re.search(r'^revision\s*=\s*"0011"', src, re.M)
    assert re.search(r'^down_revision\s*=\s*"0010"', src, re.M)
    assert "0011_einvoice_documents.sql" in src


def test_einvoice_documents_table_has_the_agreed_columns():
    sql = _sql()
    m = re.search(r"CREATE TABLE caratloop\.einvoice_documents\s*\((.*?)\n\);", sql, re.S)
    assert m, "einvoice_documents is not created"
    body = m.group(1)
    for col in ("company_id", "document_type", "document_id", "document_no", "irn", "ack_no", "ack_date",
                "signed_qr", "signed_invoice", "status", "cancelled_at", "created_at"):
        assert re.search(rf"^\s+{col}\s+", body, re.M), col
    assert "UNIQUE (company_id, document_type, document_id)" in body
    assert "trg_audit_einvoice_documents AFTER INSERT OR UPDATE OR DELETE" in sql


def test_einvoice_log_gains_the_journal_entry_and_the_lookup_action():
    sql = _sql()
    assert re.search(
        r"ALTER TABLE caratloop\.einvoice_log\s+ADD COLUMN IF NOT EXISTS journal_entry_id BIGINT REFERENCES caratloop\.journal_entries\(id\)",
        sql,
    )
    assert "DROP CONSTRAINT IF EXISTS chk_einvoice_log_action" in sql
    assert "'Get_IRN_By_Doc'::character varying" in sql


def test_document_vocabularies_match_the_module():
    from app.api.v1.einvoice import DOCUMENT_STATUSES, DOCUMENT_TYPES, LOG_ACTIONS

    assert permitted("chk_einvoice_document_type") == DOCUMENT_TYPES
    assert permitted("chk_einvoice_document_status") == DOCUMENT_STATUSES
    # The last definition (0011) is what the database enforces.
    assert permitted("chk_einvoice_log_action") == LOG_ACTIONS
    assert "Get_IRN_By_Doc" in LOG_ACTIONS


def test_the_endpoints_write_the_documents_table_with_the_permitted_type():
    from app.api.v1.einvoice import DOC_CREDIT_NOTE, DOCUMENT_TYPES

    assert DOC_CREDIT_NOTE in DOCUMENT_TYPES
    src = io.open(ROOT / "app" / "api" / "v1" / "einvoice.py", encoding="utf-8").read()
    assert "INSERT INTO caratloop.einvoice_documents" in src
    assert "ON CONFLICT (company_id, document_type, document_id) DO UPDATE" in src
