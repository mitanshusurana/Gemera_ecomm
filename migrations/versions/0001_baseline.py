"""Baseline: the schema the application was written against.

Loads migrations/sql/0001_baseline_legacy.sql, captured from the running
database with pg_dump. That database was created on 2026-08-02 and had never
been version controlled, which is why the audit found no schema in the repo.

This is the base of the merge rather than the reconstruction, because the
application depends on things only this schema has. sales.py reads
journal_entries.entry_uuid; a schema derived from INSERT statements alone never
had that column, so invoice creation would fail against it.

It also carries design the reconstruction lacked entirely:
  - e-invoicing: e_invoice_irn, ack no/date, QR payload, status
  - e-way bill: eway_bill_no, eway_bill_date
  - audit_log.prev_hash for a hash-chained, tamper-evident trail
  - fiscal-period locking (is_locked / locked_at / locked_by)
  - hierarchical chart of accounts (account_groups.parent_id)
  - cost centres, and reversal tracking on journal entries
  - amount_in_words, round_off and an approval workflow on invoices

Its CHECK constraints are in places stronger than the reconstruction's:
chk_jel_debit_credit requires exactly one side of a journal line to be
non-zero, where the reconstruction only forbade both being positive; and
chk_sle_quantity requires quantity > 0, not >= 0.

Migration 0002 layers on what the reconstruction contributed.

Revision ID: 0001
Revises:
"""
from pathlib import Path

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0001_baseline_legacy.sql"


def upgrade() -> None:
    sql = SQL_FILE.read_text(encoding="utf-8")
    op.execute(sql)


def downgrade() -> None:
    # The version table lives in public, so dropping this schema is safe.
    op.execute("DROP SCHEMA IF EXISTS caratloop CASCADE")
