-- Bank and cash accounts as first-class records; generic provisioning names.
--
-- The owner could not add a bank account, rename one, or say which account
-- the invoice should print remittance details for. The two bank ledger
-- accounts every company received -- BNK-001 "HDFC Bank — Current A/c" and
-- BNK-002 "SBI Bank — Current A/c" -- were placeholders baked into
-- fn_provision_company_accounts, and the only real bank details lived in
-- four columns on companies (migration 0004), one set for the whole entity
-- however many accounts it actually banks with.
--
-- A bank is a ledger account (account_type 'Bank' under the BANK group), so
-- the details belong on caratloop.accounts: bank name, branch, account
-- number, IFSC and UPI id, plus a single is_default_bank flag per company
-- that the printed documents and the storefront bridge read. The company's
-- own bank_* columns stay as the fallback for a company that has not yet
-- flagged an account.
--
-- New companies get one generic 'Bank Account' (BNK-001, flagged default)
-- and 'Cash in Hand' (CSH-001), to be renamed through the settings screen,
-- instead of two banks named after institutions the company may not use.

-- ─── accounts: bank details and the default flag ─────────────────────────────
ALTER TABLE caratloop.accounts
    ADD COLUMN IF NOT EXISTS bank_name        VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bank_branch      VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bank_account_no  VARCHAR(34),
    ADD COLUMN IF NOT EXISTS bank_ifsc        VARCHAR(11),
    ADD COLUMN IF NOT EXISTS upi_id           VARCHAR(100),
    ADD COLUMN IF NOT EXISTS is_default_bank  BOOLEAN NOT NULL DEFAULT FALSE;

-- Same shape test as chk_company_ifsc: four letters, a zero, six alphanumerics.
ALTER TABLE caratloop.accounts
    DROP CONSTRAINT IF EXISTS chk_account_ifsc;
ALTER TABLE caratloop.accounts
    ADD CONSTRAINT chk_account_ifsc
        CHECK (bank_ifsc IS NULL OR bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$');

-- One default bank per company, enforced by the database rather than by the
-- application remembering to clear the previous flag.
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_default_bank
    ON caratloop.accounts(company_id) WHERE is_default_bank;

-- ─── Backfill: every existing company gets a default bank ────────────────────
-- The lowest-coded active Bank account (BNK-001 for a provisioned company,
-- which is also the bridge's default settlement account). Its details are
-- left empty: the printed documents fall back to companies.bank_* until the
-- owner fills them in on the account, so nothing an invoice prints changes
-- by this migration.
UPDATE caratloop.accounts a
SET is_default_bank = TRUE
FROM (
    SELECT DISTINCT ON (company_id) id, company_id
    FROM caratloop.accounts
    WHERE account_type = 'Bank' AND is_active = TRUE
    ORDER BY company_id, code
) first_bank
WHERE a.id = first_bank.id
  AND NOT EXISTS (
      SELECT 1 FROM caratloop.accounts d
      WHERE d.company_id = a.company_id AND d.is_default_bank
  );

-- ─── Provisioning for companies created from here on ─────────────────────────
-- The function body from 0007_einvoice_tds_tcs.sql with the two named bank
-- placeholders replaced by one generic 'Bank Account' (flagged default) and
-- the rest of the chart unchanged. CREATE OR REPLACE keeps the existing
-- trigger bound to it.
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
            ('DUTIES_TAXES', 'Duties & Taxes', 'Liabilities', 'LIAB'),
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
            ('DUTIES_TAXES', 'Duties & Taxes', 'Liabilities', 'LIAB'),
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

    -- One generic bank account, flagged as the default the documents print,
    -- to be renamed and detailed under Settings > Bank & Cash. The company
    -- adds further accounts there; the chart no longer names banks for it.
    INSERT INTO caratloop.accounts (company_id, group_id, code, name, normal_balance, account_type, is_default_bank)
    SELECT NEW.id, g.id, v.code, v.name, v.nb, v.account_type, v.is_default_bank
    FROM (VALUES
            ('BNK-001', 'Bank Account', 'BANK', 'D', 'Bank', TRUE),
            ('CAP-001', 'Partners Capital Account', 'EQUITY', 'C', 'Capital', FALSE),
            ('CAP-002', 'Retained Earnings', 'EQUITY', 'C', 'Capital', FALSE),
            ('CRD-001', 'Sundry Creditors — Control', 'CREDITORS', 'C', 'Creditor', FALSE),
            ('CSH-001', 'Cash in Hand', 'CASH', 'D', 'Cash', FALSE),
            ('DEB-001', 'Sundry Debtors — Control', 'DEBTORS', 'D', 'Debtor', FALSE),
            ('GST-001', 'CGST Output (Material 1.5%)', 'GST_OUT', 'C', 'GST_Output', FALSE),
            ('GST-002', 'SGST Output (Material 1.5%)', 'GST_OUT', 'C', 'GST_Output', FALSE),
            ('GST-003', 'CGST Output (Making 2.5%)', 'GST_OUT', 'C', 'GST_Output', FALSE),
            ('GST-004', 'SGST Output (Making 2.5%)', 'GST_OUT', 'C', 'GST_Output', FALSE),
            ('GST-005', 'IGST Output (Material 3%)', 'GST_OUT', 'C', 'GST_Output', FALSE),
            ('GST-006', 'IGST Output (Making 5%)', 'GST_OUT', 'C', 'GST_Output', FALSE),
            ('ITC-001', 'CGST Input Tax Credit', 'ITC', 'D', 'GST_Input', FALSE),
            ('ITC-002', 'SGST Input Tax Credit', 'ITC', 'D', 'GST_Input', FALSE),
            ('ITC-003', 'IGST Input Tax Credit', 'ITC', 'D', 'GST_Input', FALSE),
            ('ITC-004', 'ITC — RCM (Self)', 'ITC', 'D', 'GST_Input', FALSE),
            ('MFG-001', 'Job Work / Karigar Charges', 'MFG_EXP', 'D', 'Expense', FALSE),
            ('MFG-002', 'Melting & Polishing Loss', 'MFG_EXP', 'D', 'Expense', FALSE),
            ('MFG-003', 'Hallmarking Charges', 'MFG_EXP', 'D', 'Expense', FALSE),
            ('MFG-004', 'Certification & Assay Charges', 'MFG_EXP', 'D', 'Expense', FALSE),
            ('OTH-001', 'Interest Income', 'OTH_INC', 'C', 'Income', FALSE),
            ('PUR-001', 'Gold Purchase (22K)', 'COGS', 'D', 'Expense', FALSE),
            ('PUR-002', 'Gold Purchase (18K)', 'COGS', 'D', 'Expense', FALSE),
            ('PUR-003', 'Old Gold Purchase (RCM)', 'COGS', 'D', 'Expense', FALSE),
            ('PUR-004', 'Gemstone Purchase', 'COGS', 'D', 'Expense', FALSE),
            ('RCM-001', 'RCM CGST Liability (Old Gold)', 'GST_RCM', 'C', 'GST_RCM', FALSE),
            ('RCM-002', 'RCM SGST Liability (Old Gold)', 'GST_RCM', 'C', 'GST_RCM', FALSE),
            ('RCM-003', 'RCM IGST Liability (Old Gold)', 'GST_RCM', 'C', 'GST_RCM', FALSE),
            ('SAL-001', 'Gold Jewelry Sales', 'SALES_GRP', 'C', 'Income', FALSE),
            ('SAL-002', 'Silver Jewelry Sales', 'SALES_GRP', 'C', 'Income', FALSE),
            ('SAL-003', 'Making Charges Income', 'SALES_GRP', 'C', 'Income', FALSE),
            ('SAL-004', 'Scrap / Polishing Dust Sales', 'SALES_GRP', 'C', 'Income', FALSE),
            ('STK-001', 'Gold Stock (22K / 916)', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-002', 'Gold Stock (18K / 750)', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-003', 'Silver Stock (92.5%)', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-004', 'Diamond Stock', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-005', 'Ruby Stock', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-006', 'Emerald Stock', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-007', 'Sapphire Stock', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-008', 'Other Gemstones Stock', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-009', 'Work in Progress (WIP)', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-010', 'Finished Goods — Rings', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-011', 'Finished Goods — Necklaces', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-012', 'Finished Goods — Earrings', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-013', 'Finished Goods — Bangles', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('STK-014', 'Scrap / Polishing Dust', 'STOCK', 'D', 'Stock_Asset', FALSE),
            ('SAL-005', 'Other Charges Income', 'SALES_GRP', 'C', 'Income', FALSE),
            ('COGS-001', 'Cost of Goods Sold', 'COGS', 'D', 'Expense', FALSE),
            ('COGS-002', 'Inventory Valuation Difference', 'COGS', 'D', 'Expense', FALSE),
            ('TDS-194Q', 'TDS Payable — s.194Q (Purchases)', 'DUTIES_TAXES', 'C', 'Provision', FALSE),
            ('TCS-206C', 'TCS Payable — s.206C(1H) (Sales)', 'DUTIES_TAXES', 'C', 'Provision', FALSE)
    ) AS v(code, name, grp, nb, account_type, is_default_bank)
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
