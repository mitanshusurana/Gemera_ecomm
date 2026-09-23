"""Initial Caratloop ERP schema.

Reconstructed from the raw SQL the application issues, because the database was
never defined in this repository. Types and constraints encode decisions that
several audit findings depended on:

  * Money is NUMERIC(18,2), never a float type, so Decimal round-trips exactly.
  * ``stock_ledger_entries.direction`` is CHECK-constrained to 'I'/'O'. A report
    filtering on 'IN'/'OUT' silently returned zero; the constraint makes the
    convention explicit and unambiguous.
  * ``purity`` is a FRACTION (0.916), not millesimal (916). Fine weight is
    computed as net_weight * purity, so the CHECK <= 1 rejects the 916 form that
    would otherwise inflate a weight 1000-fold.
  * Invoice numbers are UNIQUE per (company, fiscal year). The application mints
    them with COUNT(*)+1 under four workers, which races; this turns a silent
    duplicate into a failed insert.
  * Journal lines cannot carry a debit and a credit simultaneously, and neither
    may be negative.

Revision ID: 0001
Revises:
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


SCHEMA = """
CREATE SCHEMA IF NOT EXISTS caratloop;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Organisation ────────────────────────────────────────────────────────────

CREATE TABLE caratloop.companies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name      TEXT NOT NULL,
    trade_name      TEXT,
    gstin           VARCHAR(15),
    pan             VARCHAR(10),
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    pincode         VARCHAR(10),
    state_code      VARCHAR(2) NOT NULL DEFAULT '08',
    state_name      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT companies_gstin_format
        CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')
);

CREATE TABLE caratloop.users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL REFERENCES caratloop.companies(id),
    email          TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    full_name      TEXT,
    role           TEXT NOT NULL DEFAULT 'Viewer',
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_role_known
        CHECK (role IN ('SuperAdmin','Admin','Accountant','StoreKeeper','Auditor','Viewer'))
);
CREATE INDEX ix_users_company ON caratloop.users(company_id);

CREATE TABLE caratloop.session_logs (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES caratloop.users(id),
    session_token TEXT NOT NULL,
    ip_address    INET,
    login_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    logout_at     TIMESTAMPTZ
);
CREATE INDEX ix_session_logs_user ON caratloop.session_logs(user_id);

CREATE TABLE caratloop.fiscal_years (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES caratloop.companies(id),
    year_label  TEXT NOT NULL,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT FALSE,
    is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fiscal_years_unique UNIQUE (company_id, year_label),
    CONSTRAINT fiscal_years_ordered CHECK (end_date > start_date)
);
-- At most one active year per company.
CREATE UNIQUE INDEX ux_fiscal_years_one_active
    ON caratloop.fiscal_years(company_id) WHERE is_active;

-- ─── Chart of accounts ───────────────────────────────────────────────────────

CREATE TABLE caratloop.account_groups (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code    TEXT NOT NULL UNIQUE,
    name    TEXT NOT NULL,
    nature  TEXT NOT NULL,
    CONSTRAINT account_groups_nature_known
        CHECK (nature IN ('Asset','Liability','Equity','Revenue','Expense'))
);

CREATE TABLE caratloop.accounts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES caratloop.companies(id),
    group_id              UUID REFERENCES caratloop.account_groups(id),
    code                  TEXT NOT NULL,
    name                  TEXT NOT NULL,
    description           TEXT,
    account_type          TEXT,
    normal_balance        CHAR(2) NOT NULL DEFAULT 'Dr',
    currency              CHAR(3) NOT NULL DEFAULT 'INR',
    gstin                 VARCHAR(15),
    opening_balance       NUMERIC(18,2) NOT NULL DEFAULT 0,
    opening_balance_type  CHAR(2) NOT NULL DEFAULT 'Dr',
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    is_system             BOOLEAN NOT NULL DEFAULT FALSE,
    created_by            UUID REFERENCES caratloop.users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT accounts_code_unique UNIQUE (company_id, code),
    CONSTRAINT accounts_normal_balance CHECK (normal_balance IN ('Dr','Cr')),
    CONSTRAINT accounts_opening_type   CHECK (opening_balance_type IN ('Dr','Cr'))
);
CREATE INDEX ix_accounts_company_code ON caratloop.accounts(company_id, code);

-- ─── Parties ─────────────────────────────────────────────────────────────────

CREATE TABLE caratloop.parties (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES caratloop.companies(id),
    account_id            UUID REFERENCES caratloop.accounts(id),
    party_code            TEXT,
    party_type            TEXT NOT NULL,
    name                  TEXT NOT NULL,
    trade_name            TEXT,
    gstin                 VARCHAR(15),
    gst_reg_type          TEXT,
    pan                   VARCHAR(10),
    aadhaar_no            TEXT,
    kyc_documents         JSONB,
    email                 TEXT,
    phone                 TEXT,
    address_line1         TEXT,
    address_line2         TEXT,
    city                  TEXT,
    pincode               VARCHAR(10),
    state_code            VARCHAR(2),
    state_name            TEXT,
    credit_limit          NUMERIC(18,2) NOT NULL DEFAULT 0,
    credit_days           INTEGER NOT NULL DEFAULT 0,
    is_old_gold_supplier  BOOLEAN NOT NULL DEFAULT FALSE,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_by            UUID REFERENCES caratloop.users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT parties_code_unique  UNIQUE (company_id, party_code),
    CONSTRAINT parties_type_known   CHECK (party_type IN ('Customer','Supplier','Both','Vendor')),
    CONSTRAINT parties_credit_limit CHECK (credit_limit >= 0),
    CONSTRAINT parties_pan_format   CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$')
);
CREATE INDEX ix_parties_company ON caratloop.parties(company_id);
CREATE INDEX ix_parties_gstin   ON caratloop.parties(gstin) WHERE gstin IS NOT NULL;

-- ─── Inventory masters ───────────────────────────────────────────────────────

CREATE TABLE caratloop.units_of_measure (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code      TEXT NOT NULL UNIQUE,
    name      TEXT NOT NULL,
    decimals  SMALLINT NOT NULL DEFAULT 3
);

CREATE TABLE caratloop.stock_locations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES caratloop.companies(id),
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT stock_locations_code_unique UNIQUE (company_id, code)
);

CREATE TABLE caratloop.materials (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id           UUID NOT NULL REFERENCES caratloop.companies(id),
    uom_id               UUID REFERENCES caratloop.units_of_measure(id),
    code                 TEXT NOT NULL,
    name                 TEXT NOT NULL,
    category             TEXT,
    hsn_code             VARCHAR(8),
    gst_tax_rate         NUMERIC(5,2) NOT NULL DEFAULT 3.00,
    making_gst_rate      NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    purity_standard      TEXT,
    reorder_level        NUMERIC(14,3) NOT NULL DEFAULT 0,
    stock_account_id     UUID REFERENCES caratloop.accounts(id),
    purchase_account_id  UUID REFERENCES caratloop.accounts(id),
    sales_account_id     UUID REFERENCES caratloop.accounts(id),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT materials_code_unique UNIQUE (company_id, code),
    CONSTRAINT materials_gst_rate    CHECK (gst_tax_rate >= 0 AND gst_tax_rate <= 100)
);
CREATE INDEX ix_materials_company ON caratloop.materials(company_id);

CREATE TABLE caratloop.products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES caratloop.companies(id),
    material_id   UUID REFERENCES caratloop.materials(id),
    sku           TEXT,
    name          TEXT NOT NULL,
    product_type  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT products_sku_unique UNIQUE (company_id, sku)
);

-- ─── Double entry ────────────────────────────────────────────────────────────

CREATE SEQUENCE caratloop.journal_entry_seq;

CREATE TABLE caratloop.journal_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id  UUID REFERENCES caratloop.fiscal_years(id),
    entry_no        TEXT NOT NULL,
    entry_date      DATE NOT NULL,
    entry_type      TEXT NOT NULL,
    narration       TEXT,
    reference_no    TEXT,
    reference_type  TEXT,
    reference_id    UUID,
    total_debit     NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_credit    NUMERIC(18,2) NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'Posted',
    is_reversal     BOOLEAN NOT NULL DEFAULT FALSE,
    sequence_no     BIGINT,
    ip_address      INET,
    session_id      BIGINT REFERENCES caratloop.session_logs(id),
    created_by      UUID REFERENCES caratloop.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT journal_entries_no_unique UNIQUE (company_id, entry_no),
    CONSTRAINT journal_entries_totals_non_negative
        CHECK (total_debit >= 0 AND total_credit >= 0)
);
CREATE INDEX ix_je_company_date ON caratloop.journal_entries(company_id, entry_date);
CREATE INDEX ix_je_reference    ON caratloop.journal_entries(reference_type, reference_id);

CREATE TABLE caratloop.journal_entry_lines (
    id                BIGSERIAL PRIMARY KEY,
    journal_entry_id  UUID NOT NULL REFERENCES caratloop.journal_entries(id) ON DELETE CASCADE,
    sequence_no       INTEGER,
    account_id        UUID NOT NULL REFERENCES caratloop.accounts(id),
    party_id          UUID REFERENCES caratloop.parties(id),
    dr_amount         NUMERIC(18,2) NOT NULL DEFAULT 0,
    cr_amount         NUMERIC(18,2) NOT NULL DEFAULT 0,
    narration         TEXT,
    is_reconciled     BOOLEAN NOT NULL DEFAULT FALSE,
    reconciled_at     TIMESTAMPTZ,
    reconciled_by     UUID REFERENCES caratloop.users(id),
    CONSTRAINT jel_amounts_non_negative CHECK (dr_amount >= 0 AND cr_amount >= 0),
    -- A line is one side or the other, never both.
    CONSTRAINT jel_single_sided CHECK (NOT (dr_amount > 0 AND cr_amount > 0))
);
CREATE INDEX ix_jel_entry   ON caratloop.journal_entry_lines(journal_entry_id);
CREATE INDEX ix_jel_account ON caratloop.journal_entry_lines(account_id);
CREATE INDEX ix_jel_party   ON caratloop.journal_entry_lines(party_id) WHERE party_id IS NOT NULL;

-- ─── Stock ledger ────────────────────────────────────────────────────────────

CREATE TABLE caratloop.stock_ledger_entries (
    id                    BIGSERIAL PRIMARY KEY,
    company_id            UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id        UUID REFERENCES caratloop.fiscal_years(id),
    location_id           UUID REFERENCES caratloop.stock_locations(id),
    material_id           UUID NOT NULL REFERENCES caratloop.materials(id),
    uom_id                UUID REFERENCES caratloop.units_of_measure(id),
    entry_date            DATE NOT NULL,
    direction             CHAR(1) NOT NULL,
    transaction_type      TEXT,
    quantity              NUMERIC(14,3) NOT NULL DEFAULT 0,
    rate                  NUMERIC(18,4) NOT NULL DEFAULT 0,
    amount                NUMERIC(18,2) NOT NULL DEFAULT 0,
    gross_weight          NUMERIC(14,3),
    net_weight            NUMERIC(14,3),
    fine_weight           NUMERIC(14,3),
    purity                NUMERIC(6,4),
    batch_no              TEXT,
    remarks               TEXT,
    source_document_type  TEXT,
    source_document_id    UUID,
    source_document_no    TEXT,
    sequence_no           BIGINT,
    ip_address            INET,
    created_by            UUID REFERENCES caratloop.users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 'I' inward / 'O' outward. Every writer uses these; a report that filtered
    -- on 'IN'/'OUT' silently reported zero movement.
    CONSTRAINT sle_direction_known CHECK (direction IN ('I','O')),
    CONSTRAINT sle_quantity_non_negative CHECK (quantity >= 0),
    -- Purity is a fraction (0.916), never millesimal (916): fine_weight is
    -- net_weight * purity, so 916 would inflate the weight 1000-fold.
    CONSTRAINT sle_purity_is_fraction CHECK (purity IS NULL OR (purity > 0 AND purity <= 1))
);
CREATE INDEX ix_sle_company_material ON caratloop.stock_ledger_entries(company_id, material_id, entry_date);
CREATE INDEX ix_sle_source           ON caratloop.stock_ledger_entries(source_document_type, source_document_id);

-- ─── Sales ───────────────────────────────────────────────────────────────────

CREATE TABLE caratloop.sales_invoices (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id               UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id           UUID NOT NULL REFERENCES caratloop.fiscal_years(id),
    customer_id              UUID NOT NULL REFERENCES caratloop.parties(id),
    journal_entry_id         UUID REFERENCES caratloop.journal_entries(id),
    invoice_no               TEXT NOT NULL,
    invoice_date             DATE NOT NULL,
    customer_gstin           VARCHAR(15),
    customer_state_code      VARCHAR(2),
    place_of_supply          VARCHAR(2) NOT NULL,
    is_inter_state           BOOLEAN NOT NULL DEFAULT FALSE,
    subtotal_material_value  NUMERIC(18,2) NOT NULL DEFAULT 0,
    subtotal_making_charges  NUMERIC(18,2) NOT NULL DEFAULT 0,
    subtotal_other_charges   NUMERIC(18,2) NOT NULL DEFAULT 0,
    taxable_material_value   NUMERIC(18,2) NOT NULL DEFAULT 0,
    taxable_making_value     NUMERIC(18,2) NOT NULL DEFAULT 0,
    cgst_material            NUMERIC(18,2) NOT NULL DEFAULT 0,
    sgst_material            NUMERIC(18,2) NOT NULL DEFAULT 0,
    igst_material            NUMERIC(18,2) NOT NULL DEFAULT 0,
    cgst_making              NUMERIC(18,2) NOT NULL DEFAULT 0,
    sgst_making              NUMERIC(18,2) NOT NULL DEFAULT 0,
    igst_making              NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_gst                NUMERIC(18,2) NOT NULL DEFAULT 0,
    grand_total              NUMERIC(18,2) NOT NULL DEFAULT 0,
    narration                TEXT,
    payment_terms            TEXT,
    payment_status           TEXT NOT NULL DEFAULT 'Unpaid',
    status                   TEXT NOT NULL DEFAULT 'Posted',
    created_by               UUID REFERENCES caratloop.users(id),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Gap-free, non-duplicated numbering per financial year. The application
    -- derives the number with COUNT(*)+1, which races across workers; this
    -- turns a silent duplicate into a failed insert.
    CONSTRAINT sales_invoice_no_unique UNIQUE (company_id, fiscal_year_id, invoice_no),
    CONSTRAINT sales_invoice_total_non_negative CHECK (grand_total >= 0)
);
CREATE INDEX ix_si_company_date ON caratloop.sales_invoices(company_id, invoice_date);
CREATE INDEX ix_si_customer     ON caratloop.sales_invoices(customer_id);

CREATE TABLE caratloop.sales_invoice_lines (
    id              BIGSERIAL PRIMARY KEY,
    invoice_id      UUID NOT NULL REFERENCES caratloop.sales_invoices(id) ON DELETE CASCADE,
    sequence_no     INTEGER,
    material_id     UUID REFERENCES caratloop.materials(id),
    uom_id          UUID REFERENCES caratloop.units_of_measure(id),
    description     TEXT,
    hsn_sac_code    VARCHAR(8),
    quantity        NUMERIC(14,3) NOT NULL DEFAULT 0,
    gross_weight    NUMERIC(14,3),
    net_weight      NUMERIC(14,3),
    stone_weight    NUMERIC(14,3),
    purity          NUMERIC(6,4),
    rate            NUMERIC(18,4) NOT NULL DEFAULT 0,
    material_value  NUMERIC(18,2) NOT NULL DEFAULT 0,
    making_charges  NUMERIC(18,2) NOT NULL DEFAULT 0,
    other_charges   NUMERIC(18,2) NOT NULL DEFAULT 0,
    discount_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
    mat_gst_rate    NUMERIC(5,2) NOT NULL DEFAULT 3.00,
    line_total      NUMERIC(18,2) NOT NULL DEFAULT 0,
    CONSTRAINT sil_quantity_positive CHECK (quantity >= 0),
    -- A discount above 100% produced a negative taxable value and negative tax.
    CONSTRAINT sil_discount_range CHECK (discount_pct >= 0 AND discount_pct <= 100),
    CONSTRAINT sil_purity_is_fraction CHECK (purity IS NULL OR (purity > 0 AND purity <= 1)),
    -- Net weight cannot exceed gross weight.
    CONSTRAINT sil_weights_consistent
        CHECK (gross_weight IS NULL OR net_weight IS NULL OR net_weight <= gross_weight)
);
CREATE INDEX ix_sil_invoice ON caratloop.sales_invoice_lines(invoice_id);

-- ─── Purchases ───────────────────────────────────────────────────────────────

CREATE TABLE caratloop.purchase_invoices (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id        UUID NOT NULL REFERENCES caratloop.fiscal_years(id),
    vendor_id             UUID NOT NULL REFERENCES caratloop.parties(id),
    bill_no               TEXT NOT NULL,
    bill_date             DATE NOT NULL,
    vendor_inv_no         TEXT,
    vendor_invoice_date   DATE,
    place_of_supply       VARCHAR(2),
    subtotal_value        NUMERIC(18,2) NOT NULL DEFAULT 0,
    taxable_value         NUMERIC(18,2) NOT NULL DEFAULT 0,
    cgst_amount           NUMERIC(18,2) NOT NULL DEFAULT 0,
    sgst_amount           NUMERIC(18,2) NOT NULL DEFAULT 0,
    igst_amount           NUMERIC(18,2) NOT NULL DEFAULT 0,
    rcm_cgst              NUMERIC(18,2) NOT NULL DEFAULT 0,
    rcm_sgst              NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_gst             NUMERIC(18,2) NOT NULL DEFAULT 0,
    grand_total           NUMERIC(18,2) NOT NULL DEFAULT 0,
    is_old_gold_purchase  BOOLEAN NOT NULL DEFAULT FALSE,
    is_rcm_applicable     BOOLEAN NOT NULL DEFAULT FALSE,
    attachment_url        TEXT,
    payment_status        TEXT NOT NULL DEFAULT 'Unpaid',
    created_by            UUID REFERENCES caratloop.users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT purchase_bill_no_unique UNIQUE (company_id, fiscal_year_id, bill_no)
);
CREATE INDEX ix_pi_company_date ON caratloop.purchase_invoices(company_id, bill_date);
CREATE INDEX ix_pi_vendor       ON caratloop.purchase_invoices(vendor_id);

CREATE TABLE caratloop.purchase_invoice_lines (
    id              BIGSERIAL PRIMARY KEY,
    invoice_id      UUID NOT NULL REFERENCES caratloop.purchase_invoices(id) ON DELETE CASCADE,
    sequence_no     INTEGER,
    material_id     UUID REFERENCES caratloop.materials(id),
    uom_id          UUID REFERENCES caratloop.units_of_measure(id),
    description     TEXT,
    hsn_sac_code    VARCHAR(8),
    quantity        NUMERIC(14,3) NOT NULL DEFAULT 0,
    gross_weight    NUMERIC(14,3),
    net_weight      NUMERIC(14,3),
    purity          NUMERIC(6,4),
    rate            NUMERIC(18,4) NOT NULL DEFAULT 0,
    material_value  NUMERIC(18,2) NOT NULL DEFAULT 0,
    making_charges  NUMERIC(18,2) NOT NULL DEFAULT 0,
    gst_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
    is_rcm          BOOLEAN NOT NULL DEFAULT FALSE,
    line_total      NUMERIC(18,2) NOT NULL DEFAULT 0,
    CONSTRAINT pil_quantity_non_negative CHECK (quantity >= 0),
    CONSTRAINT pil_purity_is_fraction CHECK (purity IS NULL OR (purity > 0 AND purity <= 1))
);
CREATE INDEX ix_pil_invoice ON caratloop.purchase_invoice_lines(invoice_id);

-- ─── GST registers ───────────────────────────────────────────────────────────

CREATE TABLE caratloop.gst_output_tax_register (
    id                      BIGSERIAL PRIMARY KEY,
    company_id              UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id          UUID REFERENCES caratloop.fiscal_years(id),
    invoice_id              UUID REFERENCES caratloop.sales_invoices(id),
    invoice_no              TEXT NOT NULL,
    invoice_date            DATE NOT NULL,
    return_period           VARCHAR(7) NOT NULL,
    party_id                UUID REFERENCES caratloop.parties(id),
    party_gstin             VARCHAR(15),
    place_of_supply         VARCHAR(2),
    is_inter_state          BOOLEAN NOT NULL DEFAULT FALSE,
    supply_type             TEXT,
    taxable_material_value  NUMERIC(18,2) NOT NULL DEFAULT 0,
    taxable_making_value    NUMERIC(18,2) NOT NULL DEFAULT 0,
    material_gst_rate       NUMERIC(5,2) NOT NULL DEFAULT 3.00,
    making_gst_rate         NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    hsn_material            VARCHAR(8),
    hsn_making              VARCHAR(8),
    cgst_amount             NUMERIC(18,2) NOT NULL DEFAULT 0,
    sgst_amount             NUMERIC(18,2) NOT NULL DEFAULT 0,
    igst_amount             NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_tax               NUMERIC(18,2) NOT NULL DEFAULT 0,
    -- Cancellations mark this rather than deleting the row, so a filed period
    -- keeps its evidence.
    is_credit_note          BOOLEAN NOT NULL DEFAULT FALSE,
    remarks                 TEXT,
    created_by              UUID REFERENCES caratloop.users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_gst_out_period ON caratloop.gst_output_tax_register(company_id, return_period);

CREATE TABLE caratloop.itc_register (
    id                     BIGSERIAL PRIMARY KEY,
    company_id             UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id         UUID REFERENCES caratloop.fiscal_years(id),
    invoice_id             UUID REFERENCES caratloop.purchase_invoices(id),
    vendor_id              UUID REFERENCES caratloop.parties(id),
    vendor_gstin           VARCHAR(15),
    vendor_invoice_no      TEXT,
    invoice_date           DATE,
    return_period          VARCHAR(7),
    itc_type               TEXT,
    cgst_credit            NUMERIC(18,2) NOT NULL DEFAULT 0,
    sgst_credit            NUMERIC(18,2) NOT NULL DEFAULT 0,
    igst_credit            NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_itc              NUMERIC(18,2) NOT NULL DEFAULT 0,
    is_eligible            BOOLEAN NOT NULL DEFAULT TRUE,
    ineligibility_reason   TEXT,
    gstr2b_matched         BOOLEAN NOT NULL DEFAULT FALSE,
    gstr2b_match_date      DATE,
    created_by             UUID REFERENCES caratloop.users(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_itc_period ON caratloop.itc_register(company_id, return_period);

CREATE TABLE caratloop.rcm_liability_register (
    id                   BIGSERIAL PRIMARY KEY,
    company_id           UUID NOT NULL REFERENCES caratloop.companies(id),
    purchase_invoice_id  UUID REFERENCES caratloop.purchase_invoices(id),
    transaction_date     DATE NOT NULL,
    return_period        VARCHAR(7),
    vendor_name          TEXT,
    vendor_pan           VARCHAR(10),
    purchase_value       NUMERIC(18,2) NOT NULL DEFAULT 0,
    rcm_rate             NUMERIC(5,2) NOT NULL DEFAULT 3.00,
    cgst_rcm             NUMERIC(18,2) NOT NULL DEFAULT 0,
    sgst_rcm             NUMERIC(18,2) NOT NULL DEFAULT 0,
    igst_rcm             NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_rcm            NUMERIC(18,2) NOT NULL DEFAULT 0,
    is_paid              BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at              TIMESTAMPTZ,
    itc_availed          BOOLEAN NOT NULL DEFAULT FALSE,
    itc_availed_period   VARCHAR(7),
    remarks              TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_rcm_period ON caratloop.rcm_liability_register(company_id, return_period);

-- ─── Production ──────────────────────────────────────────────────────────────

CREATE TABLE caratloop.bom_headers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES caratloop.companies(id),
    product_id      UUID REFERENCES caratloop.products(id),
    bom_version     TEXT NOT NULL DEFAULT '1',
    effective_from  DATE,
    created_by      UUID REFERENCES caratloop.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE caratloop.production_orders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id          UUID REFERENCES caratloop.fiscal_years(id),
    product_id              UUID REFERENCES caratloop.products(id),
    bom_id                  UUID REFERENCES caratloop.bom_headers(id),
    production_location_id  UUID REFERENCES caratloop.stock_locations(id),
    artisan_id              UUID REFERENCES caratloop.parties(id),
    order_no                TEXT NOT NULL,
    order_date              DATE NOT NULL,
    month_year              VARCHAR(7),
    planned_qty             NUMERIC(14,3) NOT NULL DEFAULT 0,
    actual_qty              NUMERIC(14,3),
    allowed_wastage_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
    status                  TEXT NOT NULL DEFAULT 'Planned',
    remarks                 TEXT,
    completed_at            TIMESTAMPTZ,
    created_by              UUID REFERENCES caratloop.users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT production_order_no_unique UNIQUE (company_id, order_no),
    CONSTRAINT production_wastage_pct_range
        CHECK (allowed_wastage_pct >= 0 AND allowed_wastage_pct <= 100)
);

CREATE TABLE caratloop.production_consumption_entries (
    id                     BIGSERIAL PRIMARY KEY,
    company_id             UUID NOT NULL REFERENCES caratloop.companies(id),
    production_order_id    UUID NOT NULL REFERENCES caratloop.production_orders(id),
    material_id            UUID NOT NULL REFERENCES caratloop.materials(id),
    uom_id                 UUID REFERENCES caratloop.units_of_measure(id),
    stock_ledger_entry_id  BIGINT REFERENCES caratloop.stock_ledger_entries(id),
    entry_date             DATE NOT NULL,
    qty_issued             NUMERIC(14,3) NOT NULL DEFAULT 0,
    gross_weight           NUMERIC(14,3),
    net_weight             NUMERIC(14,3),
    fine_weight            NUMERIC(14,3),
    purity                 NUMERIC(6,4),
    rate                   NUMERIC(18,4) NOT NULL DEFAULT 0,
    amount                 NUMERIC(18,2) NOT NULL DEFAULT 0,
    batch_no               TEXT,
    remarks                TEXT,
    ip_address             INET,
    created_by             UUID REFERENCES caratloop.users(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pce_purity_is_fraction CHECK (purity IS NULL OR (purity > 0 AND purity <= 1))
);

CREATE TABLE caratloop.production_output_entries (
    id                     BIGSERIAL PRIMARY KEY,
    company_id             UUID NOT NULL REFERENCES caratloop.companies(id),
    production_order_id    UUID NOT NULL REFERENCES caratloop.production_orders(id),
    material_id            UUID NOT NULL REFERENCES caratloop.materials(id),
    uom_id                 UUID REFERENCES caratloop.units_of_measure(id),
    stock_ledger_entry_id  BIGINT REFERENCES caratloop.stock_ledger_entries(id),
    entry_date             DATE NOT NULL,
    qty_produced           NUMERIC(14,3) NOT NULL DEFAULT 0,
    gross_weight           NUMERIC(14,3),
    net_weight             NUMERIC(14,3),
    valuation_rate         NUMERIC(18,4) NOT NULL DEFAULT 0,
    quality_grade          TEXT,
    hallmark_no            TEXT,
    ip_address             INET,
    created_by             UUID REFERENCES caratloop.users(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE caratloop.production_wastage_entries (
    id                   BIGSERIAL PRIMARY KEY,
    company_id           UUID NOT NULL REFERENCES caratloop.companies(id),
    production_order_id  UUID NOT NULL REFERENCES caratloop.production_orders(id),
    material_id          UUID NOT NULL REFERENCES caratloop.materials(id),
    uom_id               UUID REFERENCES caratloop.units_of_measure(id),
    entry_date           DATE NOT NULL,
    wastage_type         TEXT,
    qty_lost             NUMERIC(14,3) NOT NULL DEFAULT 0,
    loss_pct             NUMERIC(5,2),
    recoverable_qty      NUMERIC(14,3) NOT NULL DEFAULT 0,
    rate                 NUMERIC(18,4) NOT NULL DEFAULT 0,
    amount               NUMERIC(18,2) NOT NULL DEFAULT 0,
    remarks              TEXT,
    ip_address           INET,
    created_by           UUID REFERENCES caratloop.users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pwe_qty_non_negative CHECK (qty_lost >= 0 AND recoverable_qty >= 0)
);

-- ─── Banking ─────────────────────────────────────────────────────────────────

CREATE TABLE caratloop.bank_statement_lines (
    id                    BIGSERIAL PRIMARY KEY,
    company_id            UUID NOT NULL REFERENCES caratloop.companies(id),
    bank_account_id       UUID REFERENCES caratloop.accounts(id),
    import_batch_id       UUID,
    txn_date              DATE NOT NULL,
    value_date            DATE,
    description           TEXT,
    ref_no                TEXT,
    debit                 NUMERIC(18,2) NOT NULL DEFAULT 0,
    credit                NUMERIC(18,2) NOT NULL DEFAULT 0,
    balance               NUMERIC(18,2),
    is_reconciled         BOOLEAN NOT NULL DEFAULT FALSE,
    reconciled_at         TIMESTAMPTZ,
    reconciled_entry_id   BIGINT REFERENCES caratloop.journal_entry_lines(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_bsl_company_date ON caratloop.bank_statement_lines(company_id, txn_date);

-- Reconciliation links a bank statement line to a ledger line. banking.py
-- deletes from this table, so without it that endpoint always failed.
CREATE TABLE caratloop.reconciliation_matches (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL REFERENCES caratloop.companies(id),
    statement_line_id BIGINT NOT NULL REFERENCES caratloop.bank_statement_lines(id) ON DELETE CASCADE,
    ledger_line_id    BIGINT NOT NULL REFERENCES caratloop.journal_entry_lines(id) ON DELETE CASCADE,
    matched_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
    matched_by        UUID REFERENCES caratloop.users(id),
    matched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT recon_match_unique UNIQUE (statement_line_id, ledger_line_id)
);
CREATE INDEX ix_recon_company ON caratloop.reconciliation_matches(company_id);
"""


def upgrade() -> None:
    op.execute(SCHEMA)


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS caratloop CASCADE")
