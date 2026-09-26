"""Export invoices and multi-currency, loose gemstone lots, stock transfers.

sales_invoices carried invoice_type, currency and exchange_rate from the
baseline and nothing wrote them; adds the export particulars (kind, shipping
bill, port, buyer country, LUT) and the foreign-currency totals. Turns the
never-written stock_batches into gemstone lots: lot number, carats, pieces,
sieve size, shape, colour, clarity, origin, treatment, cost per carat, the
parent of a split and the target of a merge, a status. stock_ledger_entries
gains batch_id so a lot's balance is the sum of its own entries; sales lines
gain lot_id. Indexes for the per-company stock sequence and per-location
balances.

Revision ID: 0010
Revises: 0009
"""
from pathlib import Path

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0010_export_lots_locations.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS caratloop.ix_sle_company_location_material")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_sle_company_sequence")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_sle_batch")
    op.execute("ALTER TABLE caratloop.stock_ledger_entries DROP COLUMN IF EXISTS batch_id")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_stock_batches_parent")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_stock_batches_material_status")
    op.execute("DROP INDEX IF EXISTS caratloop.uq_stock_batch_lot_no")
    for con in ("chk_lot_status", "chk_lot_carat_weight_non_negative", "chk_lot_piece_count_positive"):
        op.execute(f"ALTER TABLE caratloop.stock_batches DROP CONSTRAINT IF EXISTS {con}")
    for col in ("lot_no", "carat_weight", "piece_count", "sieve_size", "shape", "colour", "clarity",
                "origin", "treatment", "cost_per_carat", "parent_lot_id", "merged_into_lot_id",
                "status", "location_id", "source_document_type", "source_document_id", "updated_at"):
        op.execute(f"ALTER TABLE caratloop.stock_batches DROP COLUMN IF EXISTS {col}")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_sales_invoice_lines_lot")
    op.execute("ALTER TABLE caratloop.sales_invoice_lines DROP COLUMN IF EXISTS lot_id")
    for con in ("chk_invoice_export_type", "chk_invoice_export_type_matches_kind",
                "chk_invoice_exchange_rate_positive"):
        op.execute(f"ALTER TABLE caratloop.sales_invoices DROP CONSTRAINT IF EXISTS {con}")
    for col in ("export_type", "shipping_bill_no", "shipping_bill_date", "port_code",
                "buyer_country", "lut_no", "fc_taxable_value", "fc_grand_total"):
        op.execute(f"ALTER TABLE caratloop.sales_invoices DROP COLUMN IF EXISTS {col}")
