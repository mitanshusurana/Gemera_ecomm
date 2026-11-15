"""Lock the books up to a date, budgets, bank rules, salesperson on invoices.

Adds companies.books_locked_until, sales_invoices.salesperson,
caratloop.budgets and caratloop.bank_rules.

Revision ID: 0018
Revises: 0017
"""
from pathlib import Path

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0018_lock_date_budgets_bank_rules.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS caratloop.bank_rules")
    op.execute("DROP TABLE IF EXISTS caratloop.budgets")
    op.execute("ALTER TABLE caratloop.sales_invoices DROP COLUMN IF EXISTS salesperson")
    op.execute("ALTER TABLE caratloop.companies DROP COLUMN IF EXISTS books_locked_until")
