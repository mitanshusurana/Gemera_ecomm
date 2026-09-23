"""Credit and debit notes are their own journal entry types.

vouchers.py posted them as 'Credit Note' / 'Debit Note', which chk_je_type did
not permit, so both endpoints failed at the database on every call. The value
reached the CHECK as a bind parameter, which is why the offline vocabulary test
-- which reads literals out of SQL text -- never saw it.

Revision ID: 0005
Revises: 0004
"""
from pathlib import Path

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0005_note_entry_types.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("ALTER TABLE caratloop.journal_entries DROP CONSTRAINT IF EXISTS chk_je_type")
    op.execute(
        "ALTER TABLE caratloop.journal_entries ADD CONSTRAINT chk_je_type "
        "CHECK (((entry_type)::text = ANY ((ARRAY["
        "'Sales'::character varying, 'Purchase'::character varying, "
        "'Receipt'::character varying, 'Payment'::character varying, "
        "'Contra'::character varying, 'Journal'::character varying, "
        "'Opening'::character varying, 'Closing'::character varying, "
        "'Depreciation'::character varying, 'RCM_Payment'::character varying, "
        "'ITC_Utilization'::character varying, 'Stock_Adjustment'::character varying, "
        "'Reversal'::character varying, 'Bank_Reconciliation'::character varying"
        "])::text[])))"
    )
