-- Fiscal-year lock and closing, purchase amendment history, GSTR-2B
-- reconciliation, persisted bank reconciliation.
--
-- Four gaps from docs/BUSINESS_GAPS.md closed by one migration:
--
--   1. Amending a purchase bill DELETED its lines, stock ledger entries, ITC,
--      RCM and TDS register rows and journal entries, then re-posted. Posted
--      history vanished; s.44AA books and Rule 56 registers are not allowed
--      to lose rows. Amendment now reverses and re-posts: the original bill is
--      marked 'Amended' and a NEW bill row points back at it, the registers
--      get a reversing row flagged is_reversal so every reader nets them.
--
--   2. fiscal_years.is_locked was stored and never read. It now blocks every
--      posting dated inside a locked year (HTTP 423). Year-end closing writes a
--      'Closing' journal into Retained Earnings (CAP-002, provisioned by 0003)
--      and an 'Opening' journal into the next year.
--
--   3. GSTR-2B: s.16(2)(aa) makes appearance in the supplier's filing a
--      condition of the credit. itc_register carried gstr2b_matched since the
--      baseline and nothing set it. gstr2b_entries holds the portal's JSON,
--      row by row, and the reconciliation writes the match back.
--
--   4. Bank reconciliation matches were flagged on both sides but the pairing
--      itself was never stored, so nothing could be un-matched and the BRS
--      report returned hardcoded zeros. bank_statement_lines.reconciled_entry_id
--      is a uuid while journal_entry_lines.id is a bigint, so the old column
--      could never have held the line; it is left untouched and a bigint
--      column is added beside it. reconciliation_matches gets the same.

-- ─── purchase_invoices: amendment chain ──────────────────────────────────────
ALTER TABLE caratloop.purchase_invoices
    ADD COLUMN IF NOT EXISTS amends_invoice_id UUID REFERENCES caratloop.purchase_invoices(id);
CREATE INDEX IF NOT EXISTS ix_purchase_invoices_amends
    ON caratloop.purchase_invoices(amends_invoice_id);

ALTER TABLE caratloop.purchase_invoices DROP CONSTRAINT IF EXISTS chk_pi_status;
ALTER TABLE caratloop.purchase_invoices ADD CONSTRAINT chk_pi_status
    CHECK (((status)::text = ANY ((ARRAY[
        'Draft'::character varying,
        'Approved'::character varying,
        'Posted'::character varying,
        'Cancelled'::character varying,
        'Amended'::character varying
    ])::text[])));

-- ─── Registers: reversing rows ───────────────────────────────────────────────
-- A reversal row carries the SAME positive amounts as the row it reverses and
-- is_reversal = TRUE; readers sum CASE WHEN is_reversal THEN -x ELSE x END.
-- Positive because tds_tcs_register already has chk_tds_tcs_amounts (>= 0),
-- and one convention across the three registers is easier to audit than two.
ALTER TABLE caratloop.itc_register
    ADD COLUMN IF NOT EXISTS is_reversal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE caratloop.itc_register
    ADD COLUMN IF NOT EXISTS reversal_of_id BIGINT REFERENCES caratloop.itc_register(id);
ALTER TABLE caratloop.rcm_liability_register
    ADD COLUMN IF NOT EXISTS is_reversal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE caratloop.rcm_liability_register
    ADD COLUMN IF NOT EXISTS reversal_of_id BIGINT REFERENCES caratloop.rcm_liability_register(id);
ALTER TABLE caratloop.tds_tcs_register
    ADD COLUMN IF NOT EXISTS is_reversal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE caratloop.tds_tcs_register
    ADD COLUMN IF NOT EXISTS reversal_of_id BIGINT REFERENCES caratloop.tds_tcs_register(id);

-- ─── fiscal_years: closing ───────────────────────────────────────────────────
-- is_locked / locked_at / locked_by are in the baseline; is_closed came with
-- 0002. The closing journal is recorded so the year cannot be closed twice
-- and the entry can be found from the year.
ALTER TABLE caratloop.fiscal_years
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE caratloop.fiscal_years
    ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES caratloop.users(id);
ALTER TABLE caratloop.fiscal_years
    ADD COLUMN IF NOT EXISTS closing_journal_entry_id BIGINT REFERENCES caratloop.journal_entries(id);
ALTER TABLE caratloop.fiscal_years
    ADD COLUMN IF NOT EXISTS opening_journal_entry_id BIGINT REFERENCES caratloop.journal_entries(id);

-- Retained Earnings for companies that predate 0003's provisioning function
-- (it already seeds CAP-002 for new companies, so the function is not
-- re-created here). Guarded by uq_account_code on (company_id, code).
INSERT INTO caratloop.accounts (company_id, group_id, code, name, normal_balance, account_type)
SELECT c.id, g.id, 'CAP-002', 'Retained Earnings', 'C', 'Capital'
FROM caratloop.companies c
JOIN caratloop.account_groups g ON g.company_id = c.id AND g.code = 'EQUITY'
ON CONFLICT (company_id, code) DO NOTHING;

-- ─── gstr2b_entries: the portal's GSTR-2B, one row per supplier invoice ──────
CREATE TABLE caratloop.gstr2b_entries (
    id                  BIGSERIAL PRIMARY KEY,
    company_id          UUID NOT NULL REFERENCES caratloop.companies(id),
    return_period       CHAR(7) NOT NULL,
    supplier_gstin      VARCHAR(15) NOT NULL,
    supplier_name       VARCHAR(200),
    invoice_no          VARCHAR(50) NOT NULL,
    invoice_no_norm     VARCHAR(50) NOT NULL,
    invoice_date        DATE,
    invoice_value       NUMERIC(18,2) NOT NULL DEFAULT 0,
    place_of_supply     VARCHAR(2),
    is_reverse_charge   BOOLEAN NOT NULL DEFAULT FALSE,
    taxable             NUMERIC(18,2) NOT NULL DEFAULT 0,
    igst                NUMERIC(14,2) NOT NULL DEFAULT 0,
    cgst                NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst                NUMERIC(14,2) NOT NULL DEFAULT 0,
    cess                NUMERIC(14,2) NOT NULL DEFAULT 0,
    itc_available       BOOLEAN NOT NULL DEFAULT TRUE,
    raw                 JSONB,
    matched_itc_id      BIGINT REFERENCES caratloop.itc_register(id),
    match_status        VARCHAR(20),
    match_note          TEXT,
    imported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    imported_by         UUID NOT NULL REFERENCES caratloop.users(id),
    reconciled_at       TIMESTAMPTZ,
    CONSTRAINT uq_gstr2b_entry UNIQUE (company_id, return_period, supplier_gstin, invoice_no_norm),
    CONSTRAINT chk_gstr2b_match_status CHECK (match_status IS NULL OR ((match_status)::text = ANY ((ARRAY[
        'Matched'::character varying,
        'Mismatch'::character varying,
        'Missing_In_Books'::character varying,
        'Missing_In_2B'::character varying
    ])::text[])))
);
CREATE INDEX IF NOT EXISTS ix_gstr2b_entries_period
    ON caratloop.gstr2b_entries(company_id, return_period);
CREATE INDEX IF NOT EXISTS ix_gstr2b_entries_match
    ON caratloop.gstr2b_entries(matched_itc_id);

DROP TRIGGER IF EXISTS trg_audit_gstr2b_entries ON caratloop.gstr2b_entries;
CREATE TRIGGER trg_audit_gstr2b_entries AFTER INSERT OR UPDATE OR DELETE ON caratloop.gstr2b_entries FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- ─── Bank reconciliation that persists ───────────────────────────────────────
ALTER TABLE caratloop.bank_statement_lines
    ADD COLUMN IF NOT EXISTS reconciled_entry_line_id BIGINT REFERENCES caratloop.journal_entry_lines(id);
CREATE INDEX IF NOT EXISTS ix_bank_statement_lines_account_date
    ON caratloop.bank_statement_lines(bank_account_id, txn_date);

-- reconciliation_matches.book_entry_id is a uuid; the book side of a match is
-- a journal_entry_lines row whose id is a bigint. The uuid column now carries
-- the parent journal entry's entry_uuid (a real identifier, kept for anyone
-- reading the old column) and the line itself goes in book_entry_line_id.
ALTER TABLE caratloop.reconciliation_matches
    ALTER COLUMN book_entry_id DROP NOT NULL;
ALTER TABLE caratloop.reconciliation_matches
    ADD COLUMN IF NOT EXISTS book_entry_line_id BIGINT REFERENCES caratloop.journal_entry_lines(id);
ALTER TABLE caratloop.reconciliation_matches
    ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES caratloop.accounts(id);
-- One statement line pairs with one book line, and vice versa; unmatching
-- deletes the row, so plain unique indexes are enough.
CREATE UNIQUE INDEX IF NOT EXISTS ux_reconciliation_matches_bank_entry
    ON caratloop.reconciliation_matches(bank_entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_reconciliation_matches_book_line
    ON caratloop.reconciliation_matches(book_entry_line_id);
CREATE INDEX IF NOT EXISTS ix_reconciliation_matches_company
    ON caratloop.reconciliation_matches(company_id, matched_at);

DROP TRIGGER IF EXISTS trg_audit_reconciliation_matches ON caratloop.reconciliation_matches;
CREATE TRIGGER trg_audit_reconciliation_matches AFTER INSERT OR UPDATE OR DELETE ON caratloop.reconciliation_matches FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();
