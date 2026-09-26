"""Fiscal-year lock and closing, purchase amendment history, GSTR-2B, BRS.

purchase_invoices gets an amendment chain (amends_invoice_id, status
'Amended') so amending a bill reverses and re-posts instead of deleting the
posted rows; the ITC, RCM and TDS/TCS registers get is_reversal so the
reversing rows can be netted by every reader. fiscal_years gets the closing
bookkeeping (closed_at/by, the closing and opening journal ids) and Retained
Earnings (CAP-002) is backfilled for companies that predate 0003. A new
gstr2b_entries table holds the portal's GSTR-2B for reconciliation against
itc_register. bank_statement_lines and reconciliation_matches get bigint
columns referencing journal_entry_lines so a match is stored and reversible.

Revision ID: 0008
Revises: 0007
"""
from pathlib import Path

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0008_fiscal_lock_amend_2b_brs.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_reconciliation_matches ON caratloop.reconciliation_matches")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_reconciliation_matches_company")
    op.execute("DROP INDEX IF EXISTS caratloop.ux_reconciliation_matches_book_line")
    op.execute("DROP INDEX IF EXISTS caratloop.ux_reconciliation_matches_bank_entry")
    op.execute("ALTER TABLE caratloop.reconciliation_matches DROP COLUMN IF EXISTS bank_account_id")
    op.execute("ALTER TABLE caratloop.reconciliation_matches DROP COLUMN IF EXISTS book_entry_line_id")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_bank_statement_lines_account_date")
    op.execute("ALTER TABLE caratloop.bank_statement_lines DROP COLUMN IF EXISTS reconciled_entry_line_id")
    op.execute("DROP TRIGGER IF EXISTS trg_audit_gstr2b_entries ON caratloop.gstr2b_entries")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_gstr2b_entries_match")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_gstr2b_entries_period")
    op.execute("DROP TABLE IF EXISTS caratloop.gstr2b_entries")
    for col in ("closed_at", "closed_by", "closing_journal_entry_id", "opening_journal_entry_id"):
        op.execute(f"ALTER TABLE caratloop.fiscal_years DROP COLUMN IF EXISTS {col}")
    for table in ("itc_register", "rcm_liability_register", "tds_tcs_register"):
        op.execute(f"ALTER TABLE caratloop.{table} DROP COLUMN IF EXISTS reversal_of_id")
        op.execute(f"ALTER TABLE caratloop.{table} DROP COLUMN IF EXISTS is_reversal")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_purchase_invoices_amends")
    op.execute("ALTER TABLE caratloop.purchase_invoices DROP COLUMN IF EXISTS amends_invoice_id")
    # The status vocabulary is not narrowed back: a row already marked
    # 'Amended' would make the old CHECK impossible to re-add, and the
    # Retained Earnings account may carry postings.
