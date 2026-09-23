"""e-invoice / e-way bill provider log, TDS s.194Q and TCS s.206C(1H).

sales_invoices already carried the IRN columns but nothing wrote them and no
record was kept of what was sent to the IRP; adds the missing columns and an
einvoice_log written on every provider call. Adds the party flags, document
columns and register for tax withheld on purchases (TDS 194Q) and collected on
sales (TCS 206C(1H)), a Duties & Taxes group with the two payable accounts for
every existing company, and re-creates fn_provision_company_accounts so new
companies get them too.

Revision ID: 0007
Revises: 0006
"""
from pathlib import Path

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0007_einvoice_tds_tcs.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_tds_tcs_register ON caratloop.tds_tcs_register")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_tds_tcs_register_party_fy")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_tds_tcs_register_document")
    op.execute("DROP TABLE IF EXISTS caratloop.tds_tcs_register")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_einvoice_log_invoice")
    op.execute("DROP TABLE IF EXISTS caratloop.einvoice_log")
    for col in ("eway_bill_valid_upto", "e_invoice_cancelled_at", "e_invoice_signed_invoice",
                "tcs_section", "tcs_rate", "tcs_base", "tcs_amount"):
        op.execute(f"ALTER TABLE caratloop.sales_invoices DROP COLUMN IF EXISTS {col}")
    for col in ("tds_section", "tds_rate", "tds_base", "tds_amount"):
        op.execute(f"ALTER TABLE caratloop.purchase_invoices DROP COLUMN IF EXISTS {col}")
    for col in ("tds_applicable", "tcs_applicable", "lower_deduction_pct", "tds_pan_verified"):
        op.execute(f"ALTER TABLE caratloop.parties DROP COLUMN IF EXISTS {col}")
    # The accounts, the group and the re-created provisioning function are
    # left in place: dropping a ledger account that may carry postings is not
    # something a downgrade should do silently.
