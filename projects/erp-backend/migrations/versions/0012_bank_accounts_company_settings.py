"""Bank and cash accounts as first-class records; generic provisioning names.

Adds bank_name, bank_branch, bank_account_no, bank_ifsc, upi_id and
is_default_bank to caratloop.accounts (one default per company, enforced by a
partial unique index), flags every existing company's first active Bank
account as its default, and re-creates fn_provision_company_accounts so a new
company receives one generic 'Bank Account' (BNK-001, default) instead of the
HDFC/SBI placeholders.

Revision ID: 0012
Revises: 0011
"""
from pathlib import Path

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0012_bank_accounts_company_settings.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS caratloop.uq_accounts_default_bank")
    op.execute("ALTER TABLE caratloop.accounts DROP CONSTRAINT IF EXISTS chk_account_ifsc")
    for col in ("is_default_bank", "upi_id", "bank_ifsc", "bank_account_no", "bank_branch", "bank_name"):
        op.execute(f"ALTER TABLE caratloop.accounts DROP COLUMN IF EXISTS {col}")
    # The provisioning function is left as re-created: reverting it would
    # bring back bank names the business may not use, and no account that
    # already exists is affected either way.
