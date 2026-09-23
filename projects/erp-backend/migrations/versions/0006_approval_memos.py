"""Approval memos (jangad): goods sent on approval, returnable, later invoiced.

Goods out on jangad had nowhere to be recorded: they were either left in the
vault on paper or booked as a sale that had not happened. Adds the memo header
and line tables, indexes for the register and aging report, and attaches the
audit trigger. Stock itself moves through stock_ledger_entries as a
Stock_Transfer into a per-company 'APPROVAL' location, created on first use.

Revision ID: 0006
Revises: 0005
"""
from pathlib import Path

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0006_approval_memos.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_approval_memo_lines ON caratloop.approval_memo_lines")
    op.execute("DROP TRIGGER IF EXISTS trg_audit_approval_memos ON caratloop.approval_memos")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_approval_memo_lines_memo")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_approval_memos_party")
    op.execute("DROP INDEX IF EXISTS caratloop.ix_approval_memos_company_status")
    op.execute("DROP TABLE IF EXISTS caratloop.approval_memo_lines")
    op.execute("DROP TABLE IF EXISTS caratloop.approval_memos")
