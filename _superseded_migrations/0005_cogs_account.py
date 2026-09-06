"""Cost of goods sold account.

No COGS account existed because no cost of goods sold was ever posted: a sale
credited revenue and debited the customer, but nothing moved value out of
stock. Gross profit therefore equalled revenue, and the balance sheet carried
inventory that had already been shipped.

Revision ID: 0005
Revises: 0004
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

ACCOUNTS = [
    ("COGS-001", "Cost of Goods Sold", "EX", "Dr"),
    # Difference between the cost relieved from stock and the value the ledger
    # held. Should stay near zero; a growing balance means the two have drifted.
    ("COGS-002", "Inventory Valuation Difference", "EX", "Dr"),
]


def upgrade() -> None:
    for code, name, group, normal in ACCOUNTS:
        op.execute(
            f"""
            INSERT INTO caratloop.accounts
                (company_id, group_id, code, name, normal_balance, is_system)
            SELECT c.id, g.id, '{code}', '{name}', '{normal}', TRUE
            FROM caratloop.companies c
            CROSS JOIN caratloop.account_groups g
            WHERE g.code = '{group}'
            ON CONFLICT (company_id, code) DO NOTHING
            """
        )


def downgrade() -> None:
    codes = ", ".join(f"'{c}'" for c, _, _, _ in ACCOUNTS)
    op.execute(f"DELETE FROM caratloop.accounts WHERE code IN ({codes}) AND is_system")
