"""Karigar party type, making-charge bills and costed job-work receipts, BOM.

Widens chk_party_type to admit 'Karigar' (an artisan paid making charges,
filed under Sundry Creditors) and adds karigar_skills. A job-work receipt now
carries the purchase invoice raised for its making charges and each received
line its rolled-up cost, so finished pieces come back into stock at metal plus
making. bom_headers gains a name, the finished material it produces and a
batch size, with constraints, indexes and audit triggers on both BOM tables.

Revision ID: 0009
Revises: 0008
"""
from pathlib import Path

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0009_karigar_job_work_costing.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_bom_lines ON caratloop.bom_lines")
    op.execute("DROP TRIGGER IF EXISTS trg_audit_bom_headers ON caratloop.bom_headers")
    op.execute("ALTER TABLE caratloop.bom_lines DROP CONSTRAINT IF EXISTS chk_bom_line_loss_pct")
    op.execute("ALTER TABLE caratloop.bom_lines DROP CONSTRAINT IF EXISTS chk_bom_line_quantity")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_bom_lines_bom")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_bom_headers_company")
    op.execute("ALTER TABLE caratloop.bom_headers DROP CONSTRAINT IF EXISTS chk_bom_output_quantity")
    for col in ("output_quantity", "output_material_id", "name"):
        op.execute(f"ALTER TABLE caratloop.bom_headers DROP COLUMN IF EXISTS {col}")
    for col in ("making_charge_share", "cost_amount", "unit_cost"):
        op.execute(f"ALTER TABLE caratloop.job_work_receipt_lines DROP COLUMN IF EXISTS {col}")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_jwr_making_charge_bill")
    for col in ("karigar_bill_no", "making_charge_bill_id"):
        op.execute(f"ALTER TABLE caratloop.job_work_receipts DROP COLUMN IF EXISTS {col}")
    op.execute("ALTER TABLE caratloop.parties DROP COLUMN IF EXISTS karigar_skills")
    # The CHECK is restored only if no row would violate it; a party already
    # stored as Karigar is data, and a downgrade must not delete it silently.
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM caratloop.parties WHERE party_type = 'Karigar') THEN "
        "  ALTER TABLE caratloop.parties DROP CONSTRAINT IF EXISTS chk_party_type; "
        "  ALTER TABLE caratloop.parties ADD CONSTRAINT chk_party_type CHECK ("
        "    ((party_type)::text = ANY ((ARRAY['Customer'::character varying, "
        "    'Vendor'::character varying, 'Both'::character varying])::text[]))); "
        "END IF; END $$"
    )
