"""Provision a usable chart of accounts for every company.

The legacy database held 24 account groups and 47 accounts as DATA, not schema,
so rebuilding from the schema alone produced a database that could not transact:
creating a company gave you no accounts, and the first sale failed looking up
SAL-001.

This carries that chart across as a trigger, so any company -- including the
first one on a fresh install -- is usable immediately.

Three codes are added that the legacy chart never defined but the application
requires:
  SAL-005  Other charges income. sales.py credited SAL-004, which is
           "Scrap / Polishing Dust Sales" in the real chart -- reusing it would
           have booked customer other-charges as scrap revenue.
  COGS-001 Cost of goods sold. No COGS was ever posted, so no account existed.
  COGS-002 Inventory valuation difference.

Two application constants were corrected to match the real chart rather than
the reconstruction's invented one: production wastage now posts to MFG-002
("Melting & Polishing Loss") instead of a non-existent MFG-LOSS.

Revision ID: 0003
Revises: 0002
"""
from pathlib import Path

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0003_provision_company.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_provision_company_accounts ON caratloop.companies"
    )
    op.execute("DROP FUNCTION IF EXISTS caratloop.fn_provision_company_accounts()")
