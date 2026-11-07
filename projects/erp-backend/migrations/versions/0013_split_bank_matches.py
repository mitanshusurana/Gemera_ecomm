"""Allow one statement line to match several book lines.

reconciliation_matches holds one row per (book line, statement line) pair.
The unique index on bank_entry_id limited a statement line to one pair, so a
single transfer that settled three bills could not be reconciled. The index
becomes a plain one; book_entry_line_id stays unique.

Revision ID: 0013
Revises: 0012
"""
from pathlib import Path

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0013_split_bank_matches.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS caratloop.ix_reconciliation_matches_bank_entry")
    # Re-creating the unique index fails if split matches exist; that is the
    # correct outcome, as the data no longer fits the old rule.
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_reconciliation_matches_bank_entry ON caratloop.reconciliation_matches(bank_entry_id)")
