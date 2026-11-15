"""A log of documents e-mailed from the books.

Adds caratloop.email_log: invoices, quotes, statements and reminders sent,
with the outcome of each attempt.

Revision ID: 0017
Revises: 0016
"""
from pathlib import Path

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0017_email_log.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS caratloop.email_log")
