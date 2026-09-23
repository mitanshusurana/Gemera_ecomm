-- e-Invoice / e-Way Bill log, TDS s.194Q, TCS s.206C(1H).
--
-- sales_invoices has carried e_invoice_irn, e_invoice_ack_no, e_invoice_ack_date,
-- e_invoice_qr_code, e_invoice_status, eway_bill_no and eway_bill_date since
-- the baseline, and nothing wrote them: the e-way bill endpoint answered 501.
-- The IRP is now called through a GSP (app/einvoice). Three columns it needs
-- were missing, and there was no record of what was sent and what came back,
-- which is the first thing anyone asks when an IRN is disputed.
--
-- Tax withheld on trade -- TDS under s.194Q by a buyer with turnover above
-- Rs 10 crore on purchases from one supplier above Rs 50 lakh in the year,
-- and TCS under s.206C(1H) by such a seller on sales to one customer above
-- the same threshold -- had nowhere to live. The party master gets the flags
-- (and the lower-deduction certificate percentage), each document gets the
-- section, rate, base and amount, and one register feeds Form 26Q / 27EQ.

-- ─── sales_invoices: the IRP fields the baseline lacked, and TCS ─────────────
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS eway_bill_valid_upto TIMESTAMPTZ;
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS e_invoice_cancelled_at TIMESTAMPTZ;
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS e_invoice_signed_invoice TEXT;
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS tcs_section VARCHAR(10);
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS tcs_rate NUMERIC(5,2);
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS tcs_base NUMERIC(18,2);
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS tcs_amount NUMERIC(18,2) NOT NULL DEFAULT 0;

-- ─── purchase_invoices: TDS ──────────────────────────────────────────────────
ALTER TABLE caratloop.purchase_invoices
    ADD COLUMN IF NOT EXISTS tds_section VARCHAR(10);
ALTER TABLE caratloop.purchase_invoices
    ADD COLUMN IF NOT EXISTS tds_rate NUMERIC(5,2);
ALTER TABLE caratloop.purchase_invoices
    ADD COLUMN IF NOT EXISTS tds_base NUMERIC(18,2);
ALTER TABLE caratloop.purchase_invoices
    ADD COLUMN IF NOT EXISTS tds_amount NUMERIC(18,2) NOT NULL DEFAULT 0;

-- ─── parties: who is deducted from / collected from ──────────────────────────
ALTER TABLE caratloop.parties
    ADD COLUMN IF NOT EXISTS tds_applicable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE caratloop.parties
    ADD COLUMN IF NOT EXISTS tcs_applicable BOOLEAN NOT NULL DEFAULT FALSE;
-- s.197 lower/nil deduction certificate: the rate it allows, NULL = none held.
ALTER TABLE caratloop.parties
    ADD COLUMN IF NOT EXISTS lower_deduction_pct NUMERIC(5,2);
-- Whether the PAN on record has been verified against the department's
-- database. An unverified PAN is still a PAN for s.206AA purposes; the flag
-- is for the accountant's own control and Form 26Q's PAN-status column.
ALTER TABLE caratloop.parties
    ADD COLUMN IF NOT EXISTS tds_pan_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE caratloop.parties
    DROP CONSTRAINT IF EXISTS chk_party_lower_deduction_pct;
ALTER TABLE caratloop.parties
    ADD CONSTRAINT chk_party_lower_deduction_pct
        CHECK (lower_deduction_pct IS NULL OR (lower_deduction_pct >= 0 AND lower_deduction_pct <= 100));

-- ─── einvoice_log: every call to the provider, success or failure ────────────
CREATE TABLE caratloop.einvoice_log (
    id                  BIGSERIAL PRIMARY KEY,
    company_id          UUID NOT NULL REFERENCES caratloop.companies(id),
    invoice_id          UUID NOT NULL REFERENCES caratloop.sales_invoices(id),
    action              VARCHAR(20) NOT NULL,
    request_payload     JSONB,
    response_payload    JSONB,
    status              VARCHAR(10) NOT NULL,
    error               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID NOT NULL REFERENCES caratloop.users(id),
    CONSTRAINT chk_einvoice_log_action CHECK (((action)::text = ANY ((ARRAY[
        'Generate_IRN'::character varying,
        'Cancel_IRN'::character varying,
        'Generate_EWB'::character varying,
        'Cancel_EWB'::character varying
    ])::text[]))),
    CONSTRAINT chk_einvoice_log_status CHECK (((status)::text = ANY ((ARRAY[
        'Success'::character varying,
        'Failed'::character varying
    ])::text[])))
);
CREATE INDEX IF NOT EXISTS ix_einvoice_log_invoice
    ON caratloop.einvoice_log(invoice_id, created_at);

-- ─── tds_tcs_register: one row per document with tax withheld/collected ──────
CREATE TABLE caratloop.tds_tcs_register (
    id                  BIGSERIAL PRIMARY KEY,
    company_id          UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id      UUID NOT NULL REFERENCES caratloop.fiscal_years(id),
    kind                VARCHAR(3) NOT NULL,
    section             VARCHAR(10) NOT NULL,
    party_id            UUID NOT NULL REFERENCES caratloop.parties(id),
    document_type       VARCHAR(20) NOT NULL,
    document_id         UUID NOT NULL,
    document_no         VARCHAR(30) NOT NULL,
    document_date       DATE NOT NULL,
    base_amount         NUMERIC(18,2) NOT NULL,
    rate                NUMERIC(5,2) NOT NULL,
    amount              NUMERIC(18,2) NOT NULL,
    pan                 VARCHAR(10),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID NOT NULL REFERENCES caratloop.users(id),
    CONSTRAINT chk_tds_tcs_kind CHECK (((kind)::text = ANY ((ARRAY[
        'TDS'::character varying,
        'TCS'::character varying
    ])::text[]))),
    CONSTRAINT chk_tds_tcs_document_type CHECK (((document_type)::text = ANY ((ARRAY[
        'PurchaseInvoice'::character varying,
        'SalesInvoice'::character varying
    ])::text[]))),
    CONSTRAINT chk_tds_tcs_amounts CHECK (base_amount >= 0 AND rate >= 0 AND amount >= 0)
);
CREATE INDEX IF NOT EXISTS ix_tds_tcs_register_party_fy
    ON caratloop.tds_tcs_register(company_id, kind, party_id, fiscal_year_id);
CREATE INDEX IF NOT EXISTS ix_tds_tcs_register_document
    ON caratloop.tds_tcs_register(document_type, document_id);

DROP TRIGGER IF EXISTS trg_audit_tds_tcs_register ON caratloop.tds_tcs_register;
CREATE TRIGGER trg_audit_tds_tcs_register AFTER INSERT OR UPDATE OR DELETE ON caratloop.tds_tcs_register FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- ─── Chart of accounts: Duties & Taxes group, TDS and TCS payable ────────────
-- For every company that already exists. The group first, so the accounts
-- can find it; guarded by NOT EXISTS because account_groups has no unique
-- key on (company_id, code) in the baseline. accounts has uq_account_code,
-- so ON CONFLICT makes a re-run harmless there.
INSERT INTO caratloop.account_groups (company_id, code, name, nature, parent_id)
SELECT c.id, 'DUTIES_TAXES', 'Duties & Taxes', 'Liabilities', p.id
FROM caratloop.companies c
JOIN caratloop.account_groups p ON p.company_id = c.id AND p.code = 'LIAB'
WHERE NOT EXISTS (
    SELECT 1 FROM caratloop.account_groups g WHERE g.company_id = c.id AND g.code = 'DUTIES_TAXES'
);

INSERT INTO caratloop.accounts (company_id, group_id, code, name, normal_balance, account_type)
SELECT c.id, g.id, v.code, v.name, 'C', 'Provision'
FROM caratloop.companies c
JOIN caratloop.account_groups g ON g.company_id = c.id AND g.code = 'DUTIES_TAXES'
CROSS JOIN (VALUES
        ('TDS-194Q', 'TDS Payable — s.194Q (Purchases)'),
        ('TCS-206C', 'TCS Payable — s.206C(1H) (Sales)')
) AS v(code, name)
ON CONFLICT (company_id, code) DO NOTHING;

-- ─── Provisioning for companies created from here on ─────────────────────────
-- The function body from 0003_provision_company.sql, with the DUTIES_TAXES
-- group in both group lists and the two payable accounts in the account list.
-- CREATE OR REPLACE keeps the existing trigger bound to it.
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
            ('COGS-002', 'Inventory Valuation Difference', 'COGS', 'D', 'Expense'),
            ('TDS-194Q', 'TDS Payable — s.194Q (Purchases)', 'DUTIES_TAXES', 'C', 'Provision'),
            ('TCS-206C', 'TCS Payable — s.206C(1H) (Sales)', 'DUTIES_TAXES', 'C', 'Provision')
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
