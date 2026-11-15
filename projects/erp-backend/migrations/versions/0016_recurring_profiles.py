"""Recurring documents: expenses, purchase bills and sales invoices on a schedule.

Adds caratloop.recurring_profiles. An expense profile may post itself on the
due date; bills and invoices are raised by a person from a prefilled form.

Revision ID: 0016
Revises: 0015
"""
from pathlib import Path

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0016_recurring_profiles.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS caratloop.recurring_profiles")
