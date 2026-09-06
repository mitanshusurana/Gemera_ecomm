"""Reference data the application hard-codes.

The posting code looks accounts up by literal code ('SAL-001', 'GST-003',
'MFG-LOSS', ...). Those lookups are shaped as INSERT ... SELECT, which inserts
nothing and raises nothing when the code is absent, so a missing account
produced a silently unbalanced entry rather than an error. Every code the
source references is created here.

Company-scoped rows are seeded for each existing company, and for none if the
database is empty -- a new company must be provisioned with the same set.

Revision ID: 0003
Revises: 0002
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


GROUPS = [
    ("AS", "Assets", "Asset"),
    ("LI", "Liabilities", "Liability"),
    ("EQ", "Equity", "Equity"),
    ("RE", "Revenue", "Revenue"),
    ("EX", "Expenses", "Expense"),
]

UOMS = [
    ("gm", "Gram", 3),
    ("kg", "Kilogram", 3),
    ("ct", "Carat", 3),
    ("pcs", "Pieces", 0),
]

# (code, name, group, normal balance)
ACCOUNTS = [
    # Receivable / payable
    ("CRD-001", "Sundry Debtors", "AS", "Dr"),
    ("PUR-001", "Sundry Creditors", "LI", "Cr"),
    # Revenue
    ("SAL-001", "Sales - Gold & Gem Material", "RE", "Cr"),
    ("SAL-003", "Sales - Making Charges", "RE", "Cr"),
    ("SAL-004", "Sales - Other Charges", "RE", "Cr"),
    # Output GST
    ("GST-001", "CGST Output - Material", "LI", "Cr"),
    ("GST-002", "SGST Output - Material", "LI", "Cr"),
    ("GST-003", "CGST Output - Making", "LI", "Cr"),
    ("GST-004", "SGST Output - Making", "LI", "Cr"),
    ("GST-005", "IGST Output - Material", "LI", "Cr"),
    ("GST-006", "IGST Output - Making", "LI", "Cr"),
    # Input tax credit
    ("ITC-001", "ITC - CGST", "AS", "Dr"),
    ("ITC-002", "ITC - SGST", "AS", "Dr"),
    ("ITC-003", "ITC - IGST", "AS", "Dr"),
    ("ITC-004", "ITC - RCM Self Invoice", "AS", "Dr"),
    # Reverse charge liability
    ("RCM-001", "RCM Liability - CGST", "LI", "Cr"),
    ("RCM-002", "RCM Liability - SGST", "LI", "Cr"),
    # Stock
    ("STK-001", "Stock - Raw Gold", "AS", "Dr"),
    ("STK-003", "Stock - Gemstones", "AS", "Dr"),
    ("STK-004", "Stock - Finished Jewellery", "AS", "Dr"),
    ("STK-005", "Stock - Silver", "AS", "Dr"),
    ("STK-006", "Stock - Platinum", "AS", "Dr"),
    ("STK-007", "Stock - Consumables", "AS", "Dr"),
    ("STK-008", "Stock - Findings & Components", "AS", "Dr"),
    ("STK-009", "Work In Progress", "AS", "Dr"),
    # Manufacturing
    ("MFG-LOSS", "Manufacturing Loss / Wastage", "EX", "Dr"),
]


def upgrade() -> None:
    for code, name, nature in GROUPS:
        op.execute(
            "INSERT INTO caratloop.account_groups (code, name, nature) "
            f"VALUES ('{code}', '{name}', '{nature}') "
            "ON CONFLICT (code) DO NOTHING"
        )

    for code, name, decimals in UOMS:
        op.execute(
            "INSERT INTO caratloop.units_of_measure (code, name, decimals) "
            f"VALUES ('{code}', '{name}', {decimals}) "
            "ON CONFLICT (code) DO NOTHING"
        )

    # Seed the chart of accounts for every company that already exists.
    for code, name, group, normal in ACCOUNTS:
        safe_name = name.replace("'", "''")
        op.execute(
            f"""
            INSERT INTO caratloop.accounts
                (company_id, group_id, code, name, normal_balance, is_system)
            SELECT c.id, g.id, '{code}', '{safe_name}', '{normal}', TRUE
            FROM caratloop.companies c
            CROSS JOIN caratloop.account_groups g
            WHERE g.code = '{group}'
            ON CONFLICT (company_id, code) DO NOTHING
            """
        )


def downgrade() -> None:
    # Remove every system account before the groups they reference. Scoping
    # this to only the codes THIS migration inserted left behind those added by
    # later migrations, and the account_groups delete then failed on a foreign
    # key -- which is exactly what happened the first time these downgrades
    # were run end to end.
    op.execute("DELETE FROM caratloop.accounts WHERE is_system")
    op.execute("DELETE FROM caratloop.units_of_measure")
    op.execute("DELETE FROM caratloop.account_groups")
