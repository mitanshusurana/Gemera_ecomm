"""e-Invoice for credit notes and duplicate-IRN recovery.

Adds caratloop.einvoice_documents, one row per (document_type, document_id)
holding the IRP's answer (IRN, acknowledgement, signed QR and invoice,
status, cancellation) for documents that have no e_invoice_* columns of
their own: credit notes, which are journal entries. Invoices keep using
their columns on sales_invoices. einvoice_log gains journal_entry_id and the
action 'Get_IRN_By_Doc', the lookup made when the IRP refuses a generate
with error 2150 because it already holds an IRN for the document.

Revision ID: 0011
Revises: 0010
"""
from pathlib import Path

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0011_einvoice_documents.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("ALTER TABLE caratloop.einvoice_log DROP CONSTRAINT IF EXISTS chk_einvoice_log_action")
    op.execute(
        "ALTER TABLE caratloop.einvoice_log ADD CONSTRAINT chk_einvoice_log_action CHECK (((action)::text = ANY ((ARRAY["
        "'Generate_IRN'::character varying, 'Cancel_IRN'::character varying, "
        "'Generate_EWB'::character varying, 'Cancel_EWB'::character varying])::text[])))"
    )
    op.execute("DROP INDEX IF EXISTS caratloop.ix_einvoice_log_journal_entry")
    op.execute("ALTER TABLE caratloop.einvoice_log DROP COLUMN IF EXISTS journal_entry_id")
    op.execute("DROP TRIGGER IF EXISTS trg_audit_einvoice_documents ON caratloop.einvoice_documents")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_einvoice_documents_irn")
    op.execute("DROP TABLE IF EXISTS caratloop.einvoice_documents")
