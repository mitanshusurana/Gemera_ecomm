-- Provision a usable chart of accounts for every company.
--
-- The legacy database held 24 account groups and 47 accounts as DATA, so a
-- rebuild from schema alone produced a company that could not post anything:
-- the first sale failed looking up SAL-001.
--
-- This is the legacy chart verbatim, plus three codes the application needs
-- that it never defined: SAL-005 (other charges -- SAL-004 is scrap sales and
-- reusing it would misclassify revenue), COGS-001 and COGS-002.
--
-- Groups are inserted parent-first so parent_id resolves.

CREATE OR REPLACE FUNCTION caratloop.fn_provision_company_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Top-level groups first, then children, so parent_id can be resolved.
    INSERT INTO caratloop.account_groups (company_id, code, name, nature, parent_id)
    SELECT NEW.id, v.code, v.name, v.nature, NULL
    FROM (VALUES
            ('ASSETS', 'Assets', 'Assets', NULL),
            ('EQUITY', 'Capital & Equity', 'Equity', NULL),
            ('EXPENSE', 'Expenses', 'Expenses', NULL),
            ('INCOME', 'Income', 'Income', NULL),
            ('LIAB', 'Liabilities', 'Liabilities', NULL),
            ('ADMIN_EXP', 'Admin & Overhead', 'Expenses', 'EXPENSE'),
            ('BANK', 'Bank Accounts', 'Assets', 'ASSETS'),
            ('CA', 'Current Assets', 'Assets', 'ASSETS'),
            ('CASH', 'Cash in Hand', 'Assets', 'ASSETS'),
            ('COGS', 'Cost of Goods Sold', 'Expenses', 'EXPENSE'),
            ('CREDITORS', 'Sundry Creditors', 'Liabilities', 'LIAB'),
            ('DEBTORS', 'Sundry Debtors', 'Assets', 'ASSETS'),
            ('FA', 'Fixed Assets', 'Assets', 'ASSETS'),
            ('FIN_CHG', 'Finance Charges', 'Expenses', 'EXPENSE'),
            ('GST_OUT', 'GST Output Tax', 'Liabilities', 'LIAB'),
            ('GST_RCM', 'GST RCM Liability', 'Liabilities', 'LIAB'),
            ('ITC', 'GST Input Tax Credit', 'Assets', 'ASSETS'),
            ('LOANS', 'Loans & Borrowings', 'Liabilities', 'LIAB'),
            ('MFG_EXP', 'Manufacturing Exp', 'Expenses', 'EXPENSE'),
            ('OTH_INC', 'Other Income', 'Income', 'INCOME'),
            ('PROV', 'Provisions', 'Liabilities', 'LIAB'),
            ('SALES_GRP', 'Sales Revenue', 'Income', 'INCOME'),
            ('SELLING', 'Selling & Distrib', 'Expenses', 'EXPENSE'),
            ('STOCK', 'Stock / Inventory', 'Assets', 'ASSETS')
    ) AS v(code, name, nature, parent_code)
    WHERE v.parent_code IS NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO caratloop.account_groups (company_id, code, name, nature, parent_id)
    SELECT NEW.id, v.code, v.name, v.nature, p.id
    FROM (VALUES
            ('ASSETS', 'Assets', 'Assets', NULL),
            ('EQUITY', 'Capital & Equity', 'Equity', NULL),
            ('EXPENSE', 'Expenses', 'Expenses', NULL),
            ('INCOME', 'Income', 'Income', NULL),
            ('LIAB', 'Liabilities', 'Liabilities', NULL),
            ('ADMIN_EXP', 'Admin & Overhead', 'Expenses', 'EXPENSE'),
            ('BANK', 'Bank Accounts', 'Assets', 'ASSETS'),
            ('CA', 'Current Assets', 'Assets', 'ASSETS'),
            ('CASH', 'Cash in Hand', 'Assets', 'ASSETS'),
            ('COGS', 'Cost of Goods Sold', 'Expenses', 'EXPENSE'),
            ('CREDITORS', 'Sundry Creditors', 'Liabilities', 'LIAB'),
            ('DEBTORS', 'Sundry Debtors', 'Assets', 'ASSETS'),
            ('FA', 'Fixed Assets', 'Assets', 'ASSETS'),
            ('FIN_CHG', 'Finance Charges', 'Expenses', 'EXPENSE'),
            ('GST_OUT', 'GST Output Tax', 'Liabilities', 'LIAB'),
            ('GST_RCM', 'GST RCM Liability', 'Liabilities', 'LIAB'),
            ('ITC', 'GST Input Tax Credit', 'Assets', 'ASSETS'),
            ('LOANS', 'Loans & Borrowings', 'Liabilities', 'LIAB'),
            ('MFG_EXP', 'Manufacturing Exp', 'Expenses', 'EXPENSE'),
            ('OTH_INC', 'Other Income', 'Income', 'INCOME'),
            ('PROV', 'Provisions', 'Liabilities', 'LIAB'),
            ('SALES_GRP', 'Sales Revenue', 'Income', 'INCOME'),
            ('SELLING', 'Selling & Distrib', 'Expenses', 'EXPENSE'),
            ('STOCK', 'Stock / Inventory', 'Assets', 'ASSETS')
    ) AS v(code, name, nature, parent_code)
    JOIN caratloop.account_groups p
      ON p.code = v.parent_code AND p.company_id = NEW.id
    WHERE v.parent_code IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO caratloop.accounts (company_id, group_id, code, name, normal_balance, account_type)
    SELECT NEW.id, g.id, v.code, v.name, v.nb, v.account_type
    FROM (VALUES
            ('BNK-001', 'HDFC Bank — Current A/c', 'BANK', 'D', 'Bank'),
            ('BNK-002', 'SBI Bank — Current A/c', 'BANK', 'D', 'Bank'),
            ('CAP-001', 'Partners Capital Account', 'EQUITY', 'C', 'Capital'),
            ('CAP-002', 'Retained Earnings', 'EQUITY', 'C', 'Capital'),
            ('CRD-001', 'Sundry Creditors — Control', 'CREDITORS', 'C', 'Creditor'),
            ('CSH-001', 'Cash in Hand', 'CASH', 'D', 'Cash'),
            ('DEB-001', 'Sundry Debtors — Control', 'DEBTORS', 'D', 'Debtor'),
            ('GST-001', 'CGST Output (Material 1.5%)', 'GST_OUT', 'C', 'GST_Output'),
            ('GST-002', 'SGST Output (Material 1.5%)', 'GST_OUT', 'C', 'GST_Output'),
            ('GST-003', 'CGST Output (Making 2.5%)', 'GST_OUT', 'C', 'GST_Output'),
            ('GST-004', 'SGST Output (Making 2.5%)', 'GST_OUT', 'C', 'GST_Output'),
            ('GST-005', 'IGST Output (Material 3%)', 'GST_OUT', 'C', 'GST_Output'),
            ('GST-006', 'IGST Output (Making 5%)', 'GST_OUT', 'C', 'GST_Output'),
            ('ITC-001', 'CGST Input Tax Credit', 'ITC', 'D', 'GST_Input'),
            ('ITC-002', 'SGST Input Tax Credit', 'ITC', 'D', 'GST_Input'),
            ('ITC-003', 'IGST Input Tax Credit', 'ITC', 'D', 'GST_Input'),
            ('ITC-004', 'ITC — RCM (Self)', 'ITC', 'D', 'GST_Input'),
            ('MFG-001', 'Job Work / Karigar Charges', 'MFG_EXP', 'D', 'Expense'),
            ('MFG-002', 'Melting & Polishing Loss', 'MFG_EXP', 'D', 'Expense'),
            ('MFG-003', 'Hallmarking Charges', 'MFG_EXP', 'D', 'Expense'),
            ('MFG-004', 'Certification & Assay Charges', 'MFG_EXP', 'D', 'Expense'),
            ('OTH-001', 'Interest Income', 'OTH_INC', 'C', 'Income'),
            ('PUR-001', 'Gold Purchase (22K)', 'COGS', 'D', 'Expense'),
            ('PUR-002', 'Gold Purchase (18K)', 'COGS', 'D', 'Expense'),
            ('PUR-003', 'Old Gold Purchase (RCM)', 'COGS', 'D', 'Expense'),
            ('PUR-004', 'Gemstone Purchase', 'COGS', 'D', 'Expense'),
            ('RCM-001', 'RCM CGST Liability (Old Gold)', 'GST_RCM', 'C', 'GST_RCM'),
            ('RCM-002', 'RCM SGST Liability (Old Gold)', 'GST_RCM', 'C', 'GST_RCM'),
            ('RCM-003', 'RCM IGST Liability (Old Gold)', 'GST_RCM', 'C', 'GST_RCM'),
            ('SAL-001', 'Gold Jewelry Sales', 'SALES_GRP', 'C', 'Income'),
            ('SAL-002', 'Silver Jewelry Sales', 'SALES_GRP', 'C', 'Income'),
            ('SAL-003', 'Making Charges Income', 'SALES_GRP', 'C', 'Income'),
            ('SAL-004', 'Scrap / Polishing Dust Sales', 'SALES_GRP', 'C', 'Income'),
            ('STK-001', 'Gold Stock (22K / 916)', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-002', 'Gold Stock (18K / 750)', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-003', 'Silver Stock (92.5%)', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-004', 'Diamond Stock', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-005', 'Ruby Stock', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-006', 'Emerald Stock', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-007', 'Sapphire Stock', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-008', 'Other Gemstones Stock', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-009', 'Work in Progress (WIP)', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-010', 'Finished Goods — Rings', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-011', 'Finished Goods — Necklaces', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-012', 'Finished Goods — Earrings', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-013', 'Finished Goods — Bangles', 'STOCK', 'D', 'Stock_Asset'),
            ('STK-014', 'Scrap / Polishing Dust', 'STOCK', 'D', 'Stock_Asset'),
            ('SAL-005', 'Other Charges Income', 'SALES_GRP', 'C', 'Income'),
            ('COGS-001', 'Cost of Goods Sold', 'COGS', 'D', 'Expense'),
            ('COGS-002', 'Inventory Valuation Difference', 'COGS', 'D', 'Expense')
    ) AS v(code, name, grp, nb, account_type)
    JOIN caratloop.account_groups g
      ON g.code = v.grp AND g.company_id = NEW.id
    ON CONFLICT DO NOTHING;

    -- Stock locations. A company with none cannot receive a purchase, issue
    -- to production, or sell: every stock ledger entry needs a location. The
    -- application used to paper over this by borrowing another company's
    -- location, which silently mixed two entities' stock. These four are the
    -- legacy set, and they cover the real movements in this business: goods
    -- sit in the vault, go out to a karigar, come back to the production
    -- floor, and end up on display.
    INSERT INTO caratloop.stock_locations (company_id, code, name, location_type, is_default)
    VALUES
        (NEW.id, 'VAULT-01',   'Main Vault',       'Vault',            TRUE),
        (NEW.id, 'PROD-FLOOR', 'Production Floor', 'Production_Floor', FALSE),
        (NEW.id, 'SHOWROOM',   'Showroom',         'Showroom',         FALSE),
        (NEW.id, 'KW-01',      'Karigar Workshop', 'Godown',           FALSE)
    ON CONFLICT (company_id, code) DO NOTHING;

    -- The fiscal year the company is being created in, plus the next one, so
    -- a company opened in March can still post in April without an admin
    -- stepping in. Derived from companies.fiscal_year_start (4 = April for an
    -- Indian FY) rather than hardcoded, because the column exists to be used.
    --
    -- fy_start_year is the calendar year the current FY began in: before the
    -- start month, the company is still in the FY that opened last year.
    DECLARE
        fy_month  INT := COALESCE(NEW.fiscal_year_start, 4);
        fy_start  INT := CASE
                             WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= COALESCE(NEW.fiscal_year_start, 4)
                             THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT
                             ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT - 1
                         END;
    BEGIN
        INSERT INTO caratloop.fiscal_years
            (company_id, year_label, start_date, end_date, is_active)
        VALUES
            (NEW.id,
             to_char(make_date(fy_start, fy_month, 1), 'YYYY') || '-' ||
                 to_char(make_date(fy_start + 1, fy_month, 1), 'YY'),
             make_date(fy_start, fy_month, 1),
             make_date(fy_start + 1, fy_month, 1) - 1,
             TRUE),
            (NEW.id,
             to_char(make_date(fy_start + 1, fy_month, 1), 'YYYY') || '-' ||
                 to_char(make_date(fy_start + 2, fy_month, 1), 'YY'),
             make_date(fy_start + 1, fy_month, 1),
             make_date(fy_start + 2, fy_month, 1) - 1,
             FALSE)
        ON CONFLICT (company_id, year_label) DO NOTHING;
    END;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_company_accounts ON caratloop.companies;
CREATE TRIGGER trg_provision_company_accounts
    AFTER INSERT ON caratloop.companies
    FOR EACH ROW EXECUTE FUNCTION caratloop.fn_provision_company_accounts();

-- No backfill: a trigger function cannot be invoked directly, and this runs
-- on a schema with no companies yet. Any company created from here on is
-- provisioned by the trigger above.
