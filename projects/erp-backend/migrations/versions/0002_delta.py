"""Delta over the baseline: what the reconstruction contributed.

The baseline (0001) is the schema the app was written against. This adds only
what it genuinely lacked, established by comparing both schemas live rather
than by reading DDL:

  - job work under CGST s.143 / Rule 45, with ITC-04 support
  - atomic document numbering (COUNT(*)+1 raced across four uvicorn workers)
  - ten columns the application writes that the baseline had no home for
  - two CHECK constraints the baseline lacks
  - append-only enforcement on audit_log
  - audit coverage widened from six tables to twenty-seven
  - twenty-five performance indexes; the baseline declared none, every one of
    its sixty-four indexes backs a primary key or unique constraint
  - the cost-of-goods-sold accounts

Deliberately NOT included, because the baseline already has them and in two
cases more strictly:
  - fn_audit_trigger      the baseline chains rows via prev_hash
  - chk_sle_direction     identical
  - chk_jel_debit_credit  requires exactly one side non-zero; the
                          reconstruction only forbade both being positive
  - chk_sle_quantity      quantity > 0, where the reconstruction allowed >= 0
  - uq_sales_invoice_no   identical

Revision ID: 0002
Revises: 0001
"""
from pathlib import Path

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0002_delta.sql"

# Cost of goods sold. The baseline has no COGS account because no COGS was ever
# posted: a sale credited revenue and debited the customer, but nothing moved
# value out of stock, so gross profit equalled revenue.
#
# normal_balance is CHAR(1) here and chk_normal_balance allows only 'D' or 'C'
# -- the baseline's convention, not the reconstruction's 'Dr'/'Cr'.
COGS_ACCOUNTS = [
    ("COGS-001", "Cost of Goods Sold", "D"),
    ("COGS-002", "Inventory Valuation Difference", "D"),
]


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))

    for code, name, normal in COGS_ACCOUNTS:
        op.execute(
            f"""
            INSERT INTO caratloop.accounts (company_id, group_id, code, name, normal_balance)
            SELECT c.id, g.id, '{code}', '{name}', '{normal}'
            FROM caratloop.companies c
            LEFT JOIN caratloop.account_groups g
              ON g.nature = 'Expense'
             AND (g.company_id IS NULL OR g.company_id = c.id)
            WHERE NOT EXISTS (
                SELECT 1 FROM caratloop.accounts a
                WHERE a.company_id = c.id AND a.code = '{code}'
            )
            LIMIT 1
            """
        )


def downgrade() -> None:
    codes = ", ".join(f"'{c}'" for c, _, _ in COGS_ACCOUNTS)
    op.execute(f"DELETE FROM caratloop.accounts WHERE code IN ({codes})")

    op.execute("DROP TABLE IF EXISTS caratloop.job_work_receipt_lines CASCADE")
    op.execute("DROP TABLE IF EXISTS caratloop.job_work_receipts CASCADE")
    op.execute("DROP TABLE IF EXISTS caratloop.job_work_challan_lines CASCADE")
    op.execute("DROP TABLE IF EXISTS caratloop.job_work_challans CASCADE")
    op.execute("DROP FUNCTION IF EXISTS caratloop.next_document_number(UUID, UUID, TEXT)")
    op.execute("DROP TABLE IF EXISTS caratloop.document_counters CASCADE")
    op.execute("DROP TRIGGER IF EXISTS trg_audit_log_no_update ON caratloop.audit_log")
    op.execute("DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON caratloop.audit_log")
    op.execute("DROP FUNCTION IF EXISTS caratloop.fn_audit_log_immutable()")
