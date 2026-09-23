"""Provision the chart of accounts for every company, including future ones.

Found by running the migrations against a real database for the first time:
on an empty install the seed in 0003 creates ZERO accounts, because it
cross-joins ``companies`` and there are none yet. The first sale then fails
with "Chart of accounts is missing 'SAL-001'", and so does every sale after it
until someone inserts 28 rows by hand.

A trigger on ``companies`` provisions the standard set whenever a company is
created, so the ordering problem cannot recur. The migration also back-fills
any company that already exists.

Revision ID: 0007
Revises: 0006
"""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


# code, name, account group, normal balance
STANDARD_ACCOUNTS = [
    ("CRD-001", "Sundry Debtors", "AS", "Dr"),
    ("PUR-001", "Sundry Creditors", "LI", "Cr"),
    ("SAL-001", "Sales - Gold & Gem Material", "RE", "Cr"),
    ("SAL-003", "Sales - Making Charges", "RE", "Cr"),
    ("SAL-004", "Sales - Other Charges", "RE", "Cr"),
    ("GST-001", "CGST Output - Material", "LI", "Cr"),
    ("GST-002", "SGST Output - Material", "LI", "Cr"),
    ("GST-003", "CGST Output - Making", "LI", "Cr"),
    ("GST-004", "SGST Output - Making", "LI", "Cr"),
    ("GST-005", "IGST Output - Material", "LI", "Cr"),
    ("GST-006", "IGST Output - Making", "LI", "Cr"),
    ("ITC-001", "ITC - CGST", "AS", "Dr"),
    ("ITC-002", "ITC - SGST", "AS", "Dr"),
    ("ITC-003", "ITC - IGST", "AS", "Dr"),
    ("ITC-004", "ITC - RCM Self Invoice", "AS", "Dr"),
    ("RCM-001", "RCM Liability - CGST", "LI", "Cr"),
    ("RCM-002", "RCM Liability - SGST", "LI", "Cr"),
    ("STK-001", "Stock - Raw Gold", "AS", "Dr"),
    ("STK-003", "Stock - Gemstones", "AS", "Dr"),
    ("STK-004", "Stock - Finished Jewellery", "AS", "Dr"),
    ("STK-005", "Stock - Silver", "AS", "Dr"),
    ("STK-006", "Stock - Platinum", "AS", "Dr"),
    ("STK-007", "Stock - Consumables", "AS", "Dr"),
    ("STK-008", "Stock - Findings & Components", "AS", "Dr"),
    ("STK-009", "Work In Progress", "AS", "Dr"),
    ("MFG-LOSS", "Manufacturing Loss / Wastage", "EX", "Dr"),
    ("COGS-001", "Cost of Goods Sold", "EX", "Dr"),
    ("COGS-002", "Inventory Valuation Difference", "EX", "Dr"),
    ("JW-001", "Job Work Charges", "EX", "Dr"),
    ("JW-002", "Goods with Job Worker", "AS", "Dr"),
]


def _values_sql() -> str:
    rows = []
    for code, name, grp, nb in STANDARD_ACCOUNTS:
        safe = name.replace("'", "''")
        rows.append(f"('{code}','{safe}','{grp}','{nb}')")
    return ",\n            ".join(rows)


def upgrade() -> None:
    values = _values_sql()

    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION caratloop.fn_provision_company_accounts()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
            INSERT INTO caratloop.accounts
                (company_id, group_id, code, name, normal_balance, is_system)
            SELECT NEW.id, g.id, v.code, v.name, v.nb, TRUE
            FROM (VALUES
            {values}
            ) AS v(code, name, grp, nb)
            JOIN caratloop.account_groups g ON g.code = v.grp
            ON CONFLICT (company_id, code) DO NOTHING;

            RETURN NEW;
        END;
        $$;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_provision_company_accounts
            AFTER INSERT ON caratloop.companies
            FOR EACH ROW EXECUTE FUNCTION caratloop.fn_provision_company_accounts();
        """
    )

    # Back-fill anything that already exists, including companies created
    # between 0003 and now.
    op.execute(
        f"""
        INSERT INTO caratloop.accounts
            (company_id, group_id, code, name, normal_balance, is_system)
        SELECT c.id, g.id, v.code, v.name, v.nb, TRUE
        FROM caratloop.companies c
        CROSS JOIN (VALUES
        {values}
        ) AS v(code, name, grp, nb)
        JOIN caratloop.account_groups g ON g.code = v.grp
        ON CONFLICT (company_id, code) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_provision_company_accounts ON caratloop.companies"
    )
    op.execute("DROP FUNCTION IF EXISTS caratloop.fn_provision_company_accounts()")

    # Also remove the accounts this migration provisioned. Leaving them behind
    # made the 0003 downgrade fail: account_groups could not be deleted while
    # accounts still referenced them.
    codes = ", ".join(f"'{c}'" for c, _, _, _ in STANDARD_ACCOUNTS)
    op.execute(
        f"DELETE FROM caratloop.accounts WHERE is_system AND code IN ({codes})"
    )
