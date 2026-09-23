-- Approval memos (jangad).
--
-- Goods go out to a customer or dealer on approval: the buyer keeps them for a
-- few days, then either returns them or takes some and the remainder comes
-- back. Title does not pass until a tax invoice is raised, so the dispatch is
-- not a supply and no GST is charged on it -- but the stock has physically
-- left the vault and must show as "out on approval" rather than as on hand.
--
-- Nothing recorded this. Goods on jangad were either left in the vault on
-- paper (overstating stock) or written down as a sale that had not happened
-- (charging GST on a supply that never occurred). This is the register.
--
-- Stock movement is by Stock_Transfer from the default location into a
-- per-company 'APPROVAL' location of type Transit; a return moves it back and
-- a conversion moves it back immediately before the sales invoice issues it.
-- The two tables below hold the paper; stock_ledger_entries holds the goods.

CREATE TABLE caratloop.approval_memos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id      UUID NOT NULL REFERENCES caratloop.fiscal_years(id),
    memo_no             VARCHAR(30) NOT NULL,
    memo_date           DATE NOT NULL,
    party_id            UUID NOT NULL REFERENCES caratloop.parties(id),
    due_date            DATE NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'Open',
    narration           TEXT,
    total_quantity      NUMERIC(14,4) NOT NULL DEFAULT 0,
    total_value         NUMERIC(18,2) NOT NULL DEFAULT 0,
    created_by          UUID NOT NULL REFERENCES caratloop.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at           TIMESTAMPTZ,
    CONSTRAINT uq_approval_memo_no UNIQUE (company_id, memo_no),
    CONSTRAINT chk_apm_due_after_memo CHECK (due_date >= memo_date),
    CONSTRAINT chk_apm_status CHECK (((status)::text = ANY ((ARRAY[
        'Open'::character varying,
        'Partially_Returned'::character varying,
        'Closed'::character varying,
        'Cancelled'::character varying
    ])::text[])))
);

CREATE TABLE caratloop.approval_memo_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memo_id             UUID NOT NULL REFERENCES caratloop.approval_memos(id),
    sequence_no         INTEGER NOT NULL,
    material_id         UUID NOT NULL REFERENCES caratloop.materials(id),
    description         TEXT,
    quantity            NUMERIC(14,4) NOT NULL,
    gross_weight        NUMERIC(10,4),
    net_weight          NUMERIC(10,4),
    rate                NUMERIC(18,2) NOT NULL DEFAULT 0,
    value               NUMERIC(18,2) NOT NULL DEFAULT 0,
    quantity_returned   NUMERIC(14,4) NOT NULL DEFAULT 0,
    quantity_invoiced   NUMERIC(14,4) NOT NULL DEFAULT 0,
    invoice_id          UUID REFERENCES caratloop.sales_invoices(id),
    CONSTRAINT uq_apml_sequence UNIQUE (memo_id, sequence_no),
    CONSTRAINT chk_apml_quantity_positive CHECK (quantity > 0),
    CONSTRAINT chk_apml_returned_non_negative CHECK (quantity_returned >= 0),
    CONSTRAINT chk_apml_invoiced_non_negative CHECK (quantity_invoiced >= 0),
    -- What came back plus what was billed can never exceed what went out.
    -- The application refuses an over-return before it gets here; this is the
    -- backstop for a second worker racing the same line.
    CONSTRAINT chk_apml_settled_within_quantity
        CHECK (quantity_returned + quantity_invoiced <= quantity),
    CONSTRAINT chk_apml_net_not_more_than_gross
        CHECK (gross_weight IS NULL OR net_weight IS NULL OR net_weight <= gross_weight)
);

-- The register is read by status (what is still out) and by party (what one
-- dealer holds), and the aging report by both.
CREATE INDEX IF NOT EXISTS ix_approval_memos_company_status
    ON caratloop.approval_memos(company_id, status);
CREATE INDEX IF NOT EXISTS ix_approval_memos_party
    ON caratloop.approval_memos(party_id);
CREATE INDEX IF NOT EXISTS ix_approval_memo_lines_memo
    ON caratloop.approval_memo_lines(memo_id);

-- Same audit trail as every other document table: the baseline's
-- fn_audit_trigger, attached as 0002_delta.sql attaches it.
DROP TRIGGER IF EXISTS trg_audit_approval_memos ON caratloop.approval_memos;
CREATE TRIGGER trg_audit_approval_memos AFTER INSERT OR UPDATE OR DELETE ON caratloop.approval_memos FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_approval_memo_lines ON caratloop.approval_memo_lines;
CREATE TRIGGER trg_audit_approval_memo_lines AFTER INSERT OR UPDATE OR DELETE ON caratloop.approval_memo_lines FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();
