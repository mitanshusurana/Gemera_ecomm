-- Delta over the baseline: what the reconstruction contributed.
--
-- Deliberately NOT redefined here: fn_audit_trigger. The baseline's version
-- chains rows with prev_hash for tamper evidence; the reconstruction's did not.
-- This migration attaches the baseline function to more tables rather than
-- replacing it.
--
-- Also not re-added: chk_sle_direction, chk_jel_debit_credit, chk_sle_quantity
-- and uq_sales_invoice_no. The baseline already has all four, and in two cases
-- more strictly than the reconstruction did.

-- ─── Job work under CGST s.143 / Rule 45 (ITC-04) ────────────────────────

CREATE TABLE caratloop.job_work_challans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id      UUID REFERENCES caratloop.fiscal_years(id),
    job_worker_id       UUID NOT NULL REFERENCES caratloop.parties(id),
    challan_no          TEXT NOT NULL,
    challan_date        DATE NOT NULL,
    -- 'Input' returns within 1 year, 'CapitalGoods' within 3 (s.143(1)).
    goods_type          TEXT NOT NULL DEFAULT 'Input',
    -- Derived on insert from goods_type; the deadline the return is judged by.
    return_due_date     DATE NOT NULL,
    nature_of_work      TEXT,
    place_of_supply     VARCHAR(2),
    is_inter_state      BOOLEAN NOT NULL DEFAULT FALSE,
    status              TEXT NOT NULL DEFAULT 'Open',
    -- Set when the dispatch has been treated as a deemed supply because the
    -- deadline passed. Never cleared: the event happened.
    deemed_supply_at    TIMESTAMPTZ,
    deemed_supply_invoice_id UUID REFERENCES caratloop.sales_invoices(id),
    remarks             TEXT,
    created_by          UUID REFERENCES caratloop.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT jw_challan_no_unique UNIQUE (company_id, fiscal_year_id, challan_no),
    CONSTRAINT jw_goods_type_known CHECK (goods_type IN ('Input', 'CapitalGoods')),
    CONSTRAINT jw_status_known
        CHECK (status IN ('Open', 'PartiallyReceived', 'Closed', 'DeemedSupply')),
    CONSTRAINT jw_due_after_dispatch CHECK (return_due_date > challan_date)
);
CREATE INDEX ix_jw_challan_company ON caratloop.job_work_challans(company_id, challan_date);
CREATE INDEX ix_jw_challan_worker  ON caratloop.job_work_challans(job_worker_id);
-- Finding what is overdue is the hot query; index the open ones by deadline.
CREATE INDEX ix_jw_challan_due ON caratloop.job_work_challans(company_id, return_due_date)
    WHERE status IN ('Open', 'PartiallyReceived');

CREATE TABLE caratloop.job_work_challan_lines (
    id              BIGSERIAL PRIMARY KEY,
    challan_id      UUID NOT NULL REFERENCES caratloop.job_work_challans(id) ON DELETE CASCADE,
    sequence_no     INTEGER,
    material_id     UUID NOT NULL REFERENCES caratloop.materials(id),
    uom_id          UUID REFERENCES caratloop.units_of_measure(id),
    description     TEXT,
    hsn_code        VARCHAR(8),
    quantity_sent   NUMERIC(14,3) NOT NULL DEFAULT 0,
    gross_weight    NUMERIC(14,3),
    net_weight      NUMERIC(14,3),
    purity          NUMERIC(6,4),
    -- Value for the challan and for ITC-04. Not a sale price: the goods are
    -- not being sold, so this is the principal's own cost.
    taxable_value   NUMERIC(18,2) NOT NULL DEFAULT 0,
    CONSTRAINT jwl_qty_positive CHECK (quantity_sent > 0),
    CONSTRAINT jwl_purity_is_fraction CHECK (purity IS NULL OR (purity > 0 AND purity <= 1)),
    CONSTRAINT jwl_weights_consistent
        CHECK (gross_weight IS NULL OR net_weight IS NULL OR net_weight <= gross_weight)
);
CREATE INDEX ix_jwl_challan ON caratloop.job_work_challan_lines(challan_id);

CREATE TABLE caratloop.job_work_receipts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES caratloop.companies(id),
    challan_id      UUID NOT NULL REFERENCES caratloop.job_work_challans(id),
    receipt_no      TEXT NOT NULL,
    receipt_date    DATE NOT NULL,
    -- Making charges the karigar bills; SAC 9988, taxed at 5% when registered.
    making_charges  NUMERIC(18,2) NOT NULL DEFAULT 0,
    remarks         TEXT,
    created_by      UUID REFERENCES caratloop.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT jw_receipt_no_unique UNIQUE (company_id, receipt_no),
    CONSTRAINT jw_receipt_charges_non_negative CHECK (making_charges >= 0)
);
CREATE INDEX ix_jwr_challan ON caratloop.job_work_receipts(challan_id);

CREATE TABLE caratloop.job_work_receipt_lines (
    id                  BIGSERIAL PRIMARY KEY,
    receipt_id          UUID NOT NULL REFERENCES caratloop.job_work_receipts(id) ON DELETE CASCADE,
    challan_line_id     BIGINT NOT NULL REFERENCES caratloop.job_work_challan_lines(id),
    material_id         UUID NOT NULL REFERENCES caratloop.materials(id),
    quantity_received   NUMERIC(14,3) NOT NULL DEFAULT 0,
    -- Metal lost in melting/polishing. Normal in this trade, but it must be
    -- recorded rather than silently absorbed.
    quantity_wastage    NUMERIC(14,3) NOT NULL DEFAULT 0,
    gross_weight        NUMERIC(14,3),
    net_weight          NUMERIC(14,3),
    CONSTRAINT jwrl_quantities_non_negative
        CHECK (quantity_received >= 0 AND quantity_wastage >= 0)
);
CREATE INDEX ix_jwrl_receipt ON caratloop.job_work_receipt_lines(receipt_id);
CREATE INDEX ix_jwrl_challan_line ON caratloop.job_work_receipt_lines(challan_line_id);


-- ─── Atomic document numbering ───────────────────────────────────────────

CREATE TABLE caratloop.document_counters (
    company_id      UUID NOT NULL REFERENCES caratloop.companies(id),
    -- The nil UUID stands for "not scoped to a financial year" (party codes),
    -- because a NULL cannot participate in a primary key.
    fiscal_year_id  UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    doc_type        TEXT NOT NULL,
    last_value      BIGINT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, fiscal_year_id, doc_type),
    CONSTRAINT document_counters_non_negative CHECK (last_value >= 0)
);

CREATE OR REPLACE FUNCTION caratloop.next_document_number(
    p_company   UUID,
    p_fy        UUID,
    p_doc_type  TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_next BIGINT;
    v_fy   UUID := COALESCE(p_fy, '00000000-0000-0000-0000-000000000000'::UUID);
BEGIN
    INSERT INTO caratloop.document_counters (company_id, fiscal_year_id, doc_type, last_value)
    VALUES (p_company, v_fy, p_doc_type, 1)
    ON CONFLICT (company_id, fiscal_year_id, doc_type)
    DO UPDATE SET
        last_value = caratloop.document_counters.last_value + 1,
        updated_at = NOW()
    RETURNING last_value INTO v_next;

    RETURN v_next;
END;
$$;


-- ─── Columns the application uses that the baseline lacks ────────────────
-- Sourced from a column-level sweep of every INSERT and UPDATE in app/.
ALTER TABLE caratloop.production_orders
    ADD COLUMN IF NOT EXISTS allowed_wastage_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE caratloop.companies
    ADD COLUMN IF NOT EXISTS trade_name TEXT;
ALTER TABLE caratloop.fiscal_years
    ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE caratloop.gst_output_tax_register
    ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE caratloop.materials
    ADD COLUMN IF NOT EXISTS making_gst_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00;
ALTER TABLE caratloop.purchase_invoice_lines
    ADD COLUMN IF NOT EXISTS making_charges NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE caratloop.sales_invoice_lines
    ADD COLUMN IF NOT EXISTS mat_gst_rate NUMERIC(5,2) NOT NULL DEFAULT 3.00;
ALTER TABLE caratloop.sales_invoice_lines
    ADD COLUMN IF NOT EXISTS rate NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE caratloop.stock_ledger_entries
    ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES caratloop.units_of_measure(id);
-- units_of_measure.decimals is deliberately NOT added. The reconstruction
-- invented it; the baseline's own column for the same fact is decimal_places,
-- and nothing in the application or the frontend reads 'decimals'. Two columns
-- holding one fact drift the moment someone updates only one of them.
-- Any database that took an earlier draft of this delta can drop it.
ALTER TABLE caratloop.units_of_measure DROP COLUMN IF EXISTS decimals;

-- ─── The two integrity checks the baseline genuinely lacks ───────────────
-- discount_pct is NUMERIC(5,2), so 150 fits the type; above 100 produced a
-- negative taxable value and negative tax.
ALTER TABLE caratloop.sales_invoice_lines
    DROP CONSTRAINT IF EXISTS sil_discount_range;
ALTER TABLE caratloop.sales_invoice_lines
    ADD CONSTRAINT sil_discount_range CHECK (discount_pct >= 0 AND discount_pct <= 100);

ALTER TABLE caratloop.sales_invoice_lines
    DROP CONSTRAINT IF EXISTS sil_weights_consistent;
ALTER TABLE caratloop.sales_invoice_lines
    ADD CONSTRAINT sil_weights_consistent
    CHECK (gross_weight IS NULL OR net_weight IS NULL OR net_weight <= gross_weight);

-- purity is NUMERIC(5,4) in the baseline, so the type already caps it below
-- 10 and the millesimal 916 cannot be stored. Stated explicitly anyway, so the
-- fraction convention is visible to anyone reading the schema.
ALTER TABLE caratloop.stock_ledger_entries
    DROP CONSTRAINT IF EXISTS sle_purity_is_fraction;
ALTER TABLE caratloop.stock_ledger_entries
    ADD CONSTRAINT sle_purity_is_fraction
    CHECK (purity IS NULL OR (purity > 0 AND purity <= 1));

-- ─── audit_log is append-only ────────────────────────────────────────────
-- The baseline records rows and chains them, but nothing stopped the log
-- itself being edited. Convention is not enforcement.
CREATE OR REPLACE FUNCTION caratloop.fn_audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'caratloop.audit_log is append-only [MCA Rule 11(g)]: % is not permitted',
        TG_OP;
END;
$$;

-- The baseline protected audit_log with two rewrite rules:
--
--     CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
--     CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;
--
-- Rules are applied during query rewrite, before any row-level trigger runs,
-- so they made the trigger below unreachable -- and, worse, they discard the
-- statement silently. "UPDATE 0" comes back, no error is raised, and the
-- caller believes it succeeded. Code that tried to purge or edit the audit log
-- would report success and leave no trace of the attempt anywhere.
--
-- MCA Rule 11(g) asks that the audit trail not be disabled or altered. Both
-- forms prevent the alteration; only the trigger makes the attempt visible.
-- The rules are dropped so the exception is what callers actually see.
DROP RULE IF EXISTS audit_log_no_update ON caratloop.audit_log;
DROP RULE IF EXISTS audit_log_no_delete ON caratloop.audit_log;

DROP TRIGGER IF EXISTS trg_audit_log_no_update ON caratloop.audit_log;
CREATE TRIGGER trg_audit_log_no_update
    BEFORE UPDATE ON caratloop.audit_log
    FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_log_immutable();

DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON caratloop.audit_log;
CREATE TRIGGER trg_audit_log_no_delete
    BEFORE DELETE ON caratloop.audit_log
    FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_log_immutable();


-- ─── Widen audit coverage using the baseline's own trigger function ──────

-- The baseline attaches fn_audit_trigger to six tables. Price, stock,

-- invoice and role changes were therefore unrecorded.

DROP TRIGGER IF EXISTS trg_audit_companies ON caratloop.companies;
CREATE TRIGGER trg_audit_companies AFTER INSERT OR UPDATE OR DELETE ON caratloop.companies FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_users ON caratloop.users;
CREATE TRIGGER trg_audit_users AFTER INSERT OR UPDATE OR DELETE ON caratloop.users FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_accounts ON caratloop.accounts;
CREATE TRIGGER trg_audit_accounts AFTER INSERT OR UPDATE OR DELETE ON caratloop.accounts FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_account_groups ON caratloop.account_groups;
CREATE TRIGGER trg_audit_account_groups AFTER INSERT OR UPDATE OR DELETE ON caratloop.account_groups FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_parties ON caratloop.parties;
CREATE TRIGGER trg_audit_parties AFTER INSERT OR UPDATE OR DELETE ON caratloop.parties FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_materials ON caratloop.materials;
CREATE TRIGGER trg_audit_materials AFTER INSERT OR UPDATE OR DELETE ON caratloop.materials FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_fiscal_years ON caratloop.fiscal_years;
CREATE TRIGGER trg_audit_fiscal_years AFTER INSERT OR UPDATE OR DELETE ON caratloop.fiscal_years FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_journal_entries ON caratloop.journal_entries;
CREATE TRIGGER trg_audit_journal_entries AFTER INSERT OR UPDATE OR DELETE ON caratloop.journal_entries FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_journal_entry_lines ON caratloop.journal_entry_lines;
CREATE TRIGGER trg_audit_journal_entry_lines AFTER INSERT OR UPDATE OR DELETE ON caratloop.journal_entry_lines FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_sales_invoices ON caratloop.sales_invoices;
CREATE TRIGGER trg_audit_sales_invoices AFTER INSERT OR UPDATE OR DELETE ON caratloop.sales_invoices FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_sales_invoice_lines ON caratloop.sales_invoice_lines;
CREATE TRIGGER trg_audit_sales_invoice_lines AFTER INSERT OR UPDATE OR DELETE ON caratloop.sales_invoice_lines FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_purchase_invoices ON caratloop.purchase_invoices;
CREATE TRIGGER trg_audit_purchase_invoices AFTER INSERT OR UPDATE OR DELETE ON caratloop.purchase_invoices FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_purchase_invoice_lines ON caratloop.purchase_invoice_lines;
CREATE TRIGGER trg_audit_purchase_invoice_lines AFTER INSERT OR UPDATE OR DELETE ON caratloop.purchase_invoice_lines FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_itc_register ON caratloop.itc_register;
CREATE TRIGGER trg_audit_itc_register AFTER INSERT OR UPDATE OR DELETE ON caratloop.itc_register FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_credit_notes ON caratloop.credit_notes;
CREATE TRIGGER trg_audit_credit_notes AFTER INSERT OR UPDATE OR DELETE ON caratloop.credit_notes FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_debit_notes ON caratloop.debit_notes;
CREATE TRIGGER trg_audit_debit_notes AFTER INSERT OR UPDATE OR DELETE ON caratloop.debit_notes FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_payment_receipts ON caratloop.payment_receipts;
CREATE TRIGGER trg_audit_payment_receipts AFTER INSERT OR UPDATE OR DELETE ON caratloop.payment_receipts FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_payment_allocations ON caratloop.payment_allocations;
CREATE TRIGGER trg_audit_payment_allocations AFTER INSERT OR UPDATE OR DELETE ON caratloop.payment_allocations FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_production_orders ON caratloop.production_orders;
CREATE TRIGGER trg_audit_production_orders AFTER INSERT OR UPDATE OR DELETE ON caratloop.production_orders FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_bom_headers ON caratloop.bom_headers;
CREATE TRIGGER trg_audit_bom_headers AFTER INSERT OR UPDATE OR DELETE ON caratloop.bom_headers FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_bom_lines ON caratloop.bom_lines;
CREATE TRIGGER trg_audit_bom_lines AFTER INSERT OR UPDATE OR DELETE ON caratloop.bom_lines FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_stock_batches ON caratloop.stock_batches;
CREATE TRIGGER trg_audit_stock_batches AFTER INSERT OR UPDATE OR DELETE ON caratloop.stock_batches FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_cost_centers ON caratloop.cost_centers;
CREATE TRIGGER trg_audit_cost_centers AFTER INSERT OR UPDATE OR DELETE ON caratloop.cost_centers FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_job_work_challans ON caratloop.job_work_challans;
CREATE TRIGGER trg_audit_job_work_challans AFTER INSERT OR UPDATE OR DELETE ON caratloop.job_work_challans FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_job_work_challan_lines ON caratloop.job_work_challan_lines;
CREATE TRIGGER trg_audit_job_work_challan_lines AFTER INSERT OR UPDATE OR DELETE ON caratloop.job_work_challan_lines FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_job_work_receipts ON caratloop.job_work_receipts;
CREATE TRIGGER trg_audit_job_work_receipts AFTER INSERT OR UPDATE OR DELETE ON caratloop.job_work_receipts FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_job_work_receipt_lines ON caratloop.job_work_receipt_lines;
CREATE TRIGGER trg_audit_job_work_receipt_lines AFTER INSERT OR UPDATE OR DELETE ON caratloop.job_work_receipt_lines FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();


-- ─── Performance indexes ─────────────────────────────────────────────────

-- The baseline declares none: all 64 of its indexes back a PK or UNIQUE.

CREATE INDEX IF NOT EXISTS ix_users_company ON caratloop.users(company_id);
CREATE INDEX IF NOT EXISTS ix_session_logs_user ON caratloop.session_logs(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_years_one_active ON caratloop.fiscal_years(company_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS ix_accounts_company_code ON caratloop.accounts(company_id, code);
CREATE INDEX IF NOT EXISTS ix_parties_company ON caratloop.parties(company_id);
CREATE INDEX IF NOT EXISTS ix_parties_gstin   ON caratloop.parties(gstin) WHERE gstin IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_materials_company ON caratloop.materials(company_id);
CREATE INDEX IF NOT EXISTS ix_je_company_date ON caratloop.journal_entries(company_id, entry_date);
CREATE INDEX IF NOT EXISTS ix_je_reference    ON caratloop.journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS ix_jel_entry   ON caratloop.journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS ix_jel_account ON caratloop.journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS ix_jel_party   ON caratloop.journal_entry_lines(party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_sle_company_material ON caratloop.stock_ledger_entries(company_id, material_id, entry_date);
CREATE INDEX IF NOT EXISTS ix_sle_source           ON caratloop.stock_ledger_entries(source_document_type, source_document_id);
CREATE INDEX IF NOT EXISTS ix_si_company_date ON caratloop.sales_invoices(company_id, invoice_date);
CREATE INDEX IF NOT EXISTS ix_si_customer     ON caratloop.sales_invoices(customer_id);
CREATE INDEX IF NOT EXISTS ix_sil_invoice ON caratloop.sales_invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS ix_pi_company_date ON caratloop.purchase_invoices(company_id, bill_date);
CREATE INDEX IF NOT EXISTS ix_pi_vendor       ON caratloop.purchase_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS ix_pil_invoice ON caratloop.purchase_invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS ix_gst_out_period ON caratloop.gst_output_tax_register(company_id, return_period);
CREATE INDEX IF NOT EXISTS ix_itc_period ON caratloop.itc_register(company_id, return_period);
CREATE INDEX IF NOT EXISTS ix_rcm_period ON caratloop.rcm_liability_register(company_id, return_period);
CREATE INDEX IF NOT EXISTS ix_bsl_company_date ON caratloop.bank_statement_lines(company_id, txn_date);
CREATE INDEX IF NOT EXISTS ix_recon_company ON caratloop.reconciliation_matches(company_id);

-- ---------------------------------------------------------------------------
-- Reachable default for stock_locations.location_type
-- ---------------------------------------------------------------------------
-- The baseline declared DEFAULT 'Warehouse' on a column whose CHECK permits
-- only Vault / Production_Floor / Showroom / Transit / Godown / Other. Every
-- INSERT that omitted location_type therefore failed the constraint, so the
-- column was effectively mandatory and the default was dead. No legacy row can
-- hold 'Warehouse' (the CHECK forbade it), so nothing needs rewriting.
-- 'Godown' is the same thing under a name the constraint accepts.
ALTER TABLE caratloop.stock_locations
    ALTER COLUMN location_type SET DEFAULT 'Godown';

-- Which location goods land in when a document does not name one.
-- Without this the resolver had to guess, and "first by code" gave KW-01,
-- the karigar's workshop -- so a purchase receipt booked stock as already
-- issued to an outworker. The partial unique index allows at most one default
-- per company while leaving the rest unconstrained.
ALTER TABLE caratloop.stock_locations
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_location_default
    ON caratloop.stock_locations(company_id) WHERE is_default;

-- ---------------------------------------------------------------------------
-- Units of measure (global reference data, not per company)
-- ---------------------------------------------------------------------------
-- units_of_measure has no company_id: it is shared reference data that the
-- legacy database carried as rows, so a schema-only rebuild produced an empty
-- table and materials.uom_id (NOT NULL) could never be satisfied.
--
-- uqc_code is the GST Unit Quantity Code required on e-invoices and in GSTR-1
-- (CGST Rule 46); it is not interchangeable with the display code.
INSERT INTO caratloop.units_of_measure (code, name, uqc_code, decimal_places)
VALUES
    ('ct',   'Carats',      'CTS', 2),
    ('gm',   'Grams',       'GMS', 3),
    ('kg',   'Kilograms',   'KGS', 3),
    ('mgm',  'Milligrams',  'MGS', 0),
    ('pcs',  'Pieces',      'NOS', 0),
    ('pr',   'Pair',        'PAR', 0),
    ('set',  'Set',         'SET', 0),
    ('tola', 'Tola',        'TOL', 4)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- fn_audit_trigger: resolve each session variable independently, pin search_path
-- ---------------------------------------------------------------------------
-- Two defects in the baseline's version, both silent.
--
-- 1. All four session variables were read inside one BEGIN ... EXCEPTION WHEN
--    OTHERS block. current_setting() raises when a variable was never set, so
--    a caller that set three of the four lost ALL of them: the row was written
--    with user_id NULL, ip_address NULL and reason 'System'. An audit trail
--    that cannot say who acted or why does not satisfy MCA Rule 11(g), and
--    nothing surfaced the degradation -- the INSERT still succeeded.
--    Each variable is now resolved on its own, using the missing_ok form of
--    current_setting, so one absent value costs only that value. Empty strings
--    are treated as absent because the application sends str(x or '').
--
-- 2. The function is SECURITY DEFINER with no search_path of its own and
--    referred to audit_log and digest() unqualified. Anyone able to set
--    search_path and create objects could shadow either one and run code as
--    the definer (CWE-426). search_path is now fixed and both references are
--    schema-qualified.
--
-- The prev_hash chaining, the server-side clock_timestamp() and the changed-
-- fields diff are carried over unchanged: they are the parts that make the log
-- tamper-evident, and they were correct.
CREATE OR REPLACE FUNCTION caratloop.fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = caratloop, public, pg_temp
AS $$
DECLARE
    v_user_id    UUID;
    v_session_id BIGINT;
    v_ip_address INET;
    v_reason     TEXT;
    v_old_val    JSONB;
    v_new_val    JSONB;
    v_changed    TEXT[];
    v_row_hash   TEXT;
    v_prev_hash  TEXT;
BEGIN
    -- One variable failing must not discard the others.
    BEGIN
        v_user_id := NULLIF(current_setting('app.user_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;
    BEGIN
        v_session_id := NULLIF(current_setting('app.session_id', true), '')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
        v_session_id := NULL;
    END;
    BEGIN
        v_ip_address := NULLIF(current_setting('app.ip_address', true), '')::INET;
    EXCEPTION WHEN OTHERS THEN
        v_ip_address := NULL;
    END;
    v_reason := COALESCE(NULLIF(current_setting('app.reason', true), ''), 'System');

    IF TG_OP = 'INSERT' THEN
        v_new_val := to_jsonb(NEW);
        v_old_val := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_val := to_jsonb(OLD);
        v_new_val := to_jsonb(NEW);
        SELECT array_agg(key) INTO v_changed
        FROM jsonb_each(v_old_val) old_fields
        WHERE old_fields.value IS DISTINCT FROM (v_new_val -> old_fields.key);
    ELSIF TG_OP = 'DELETE' THEN
        v_old_val := to_jsonb(OLD);
        v_new_val := NULL;
    END IF;

    IF v_new_val IS NOT NULL THEN
        v_row_hash := encode(public.digest(v_new_val::TEXT, 'sha256'), 'hex');
    END IF;

    SELECT row_hash INTO v_prev_hash
    FROM caratloop.audit_log
    WHERE table_name = TG_TABLE_NAME
    ORDER BY id DESC LIMIT 1;

    INSERT INTO caratloop.audit_log (
        company_id, user_id, session_id, action, table_name, record_id,
        old_value, new_value, changed_fields, reason, ip_address,
        server_timestamp, row_hash, prev_hash
    ) VALUES (
        COALESCE((v_new_val->>'company_id')::UUID, (v_old_val->>'company_id')::UUID),
        v_user_id,
        v_session_id,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE((v_new_val->>'id')::TEXT, (v_old_val->>'id')::TEXT),
        v_old_val,
        v_new_val,
        v_changed,
        v_reason,
        v_ip_address,
        clock_timestamp(),  -- server-side, not client-supplied [MCA-11g]
        v_row_hash,
        v_prev_hash
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;
