"""Track how much of an invoice has actually been paid, and where to pay it.

A receipt or payment voucher of any amount flipped the invoice to 'Paid'. A
one-rupee advance against a ten-lakh bullion bill recorded the bill as settled,
dropped it from the outstanding report, and hid it from the 180-day test in
CGST s.16(2)(d) / Rule 37.

Adds amount_paid to sales_invoices and purchase_invoices, pins payment_status to
Unpaid / Partial / Paid, and derives status from the amount rather than from
whichever voucher ran last.

Revision ID: 0004
Revises: 0003
"""
from pathlib import Path

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0004_payment_tracking.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("ALTER TABLE caratloop.companies DROP CONSTRAINT IF EXISTS chk_company_ifsc")
    for col in ("bank_name", "bank_branch", "bank_account_no", "bank_ifsc"):
        op.execute(f"ALTER TABLE caratloop.companies DROP COLUMN IF EXISTS {col}")
    for table, prefix in (("sales_invoices", "si"), ("purchase_invoices", "pi")):
        op.execute(f"DROP INDEX IF EXISTS caratloop.ix_{prefix}_open")
        op.execute(f"ALTER TABLE caratloop.{table} DROP CONSTRAINT IF EXISTS chk_{prefix}_payment_status")
        op.execute(f"ALTER TABLE caratloop.{table} DROP CONSTRAINT IF EXISTS chk_{prefix}_amount_paid")
        op.execute(f"ALTER TABLE caratloop.{table} DROP COLUMN IF EXISTS amount_paid")
