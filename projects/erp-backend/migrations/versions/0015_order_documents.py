"""Quotes, sales orders and purchase orders.

Adds caratloop.order_documents and caratloop.order_document_lines: documents
of intent that post nothing to the ledger and move no stock, and that record
what they were converted into.

Revision ID: 0015
Revises: 0014
"""
from pathlib import Path

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0015_order_documents.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS caratloop.order_document_lines")
    op.execute("DROP TABLE IF EXISTS caratloop.order_documents")
