"""Expenses: a running cost paid from cash or bank, recorded in one step.

Adds caratloop.expenses: the expense document (date, expense ledger, paid
through, vendor, reference, notes) beside the Payment journal it posts. No
input tax credit is taken on an expense; a cost with GST credit stays a
purchase bill.

Revision ID: 0014
Revises: 0013
"""
from pathlib import Path

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0014_expenses.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    # The journals an expense posted stay in the books; only the document
    # table goes.
    op.execute("DROP TABLE IF EXISTS caratloop.expenses")
