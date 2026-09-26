-- e-Invoice for credit notes, and recovery of an IRN the IRP already holds.
--
-- Rule 48(4) covers credit and debit notes as well as invoices, and an IRN
-- has so far been stored only in the e_invoice_* columns of sales_invoices.
-- A credit note is a journal entry (entry_type Credit_Note) plus a row in the
-- output tax register flagged is_credit_note; neither has anywhere to keep
-- an IRN, and journal_entries is not the place to grow provider columns.
-- One table, einvoice_documents, holds the IRP's answer for any document by
-- (document_type, document_id): credit notes use it from now on and invoices
-- keep their existing columns.
--
-- einvoice_log gains the journal entry a call was made for (invoice_id stays
-- mandatory and names the invoice the note reduces), and a fifth action:
-- Get_IRN_By_Doc, the lookup made when the IRP answers 2150 (duplicate IRN)
-- so the IRN it issued earlier can be recorded here instead of being lost.

-- ─── einvoice_documents: the IRP's answer, per document ──────────────────────
CREATE TABLE caratloop.einvoice_documents (
    id                  BIGSERIAL PRIMARY KEY,
    company_id          UUID NOT NULL REFERENCES caratloop.companies(id),
    document_type       VARCHAR(20) NOT NULL,
    document_id         UUID NOT NULL,
    document_no         VARCHAR(30) NOT NULL,
    irn                 VARCHAR(64),
    ack_no              VARCHAR(20),
    ack_date            TIMESTAMPTZ,
    signed_qr           TEXT,
    signed_invoice      TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'Not_Generated',
    cancelled_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_einvoice_document UNIQUE (company_id, document_type, document_id),
    CONSTRAINT chk_einvoice_document_type CHECK (((document_type)::text = ANY ((ARRAY[
        'Invoice'::character varying,
        'Credit_Note'::character varying
    ])::text[]))),
    CONSTRAINT chk_einvoice_document_status CHECK (((status)::text = ANY ((ARRAY[
        'Not_Generated'::character varying,
        'Generated'::character varying,
        'Cancelled'::character varying
    ])::text[])))
);
CREATE INDEX IF NOT EXISTS ix_einvoice_documents_irn
    ON caratloop.einvoice_documents(company_id, irn);

DROP TRIGGER IF EXISTS trg_audit_einvoice_documents ON caratloop.einvoice_documents;
CREATE TRIGGER trg_audit_einvoice_documents AFTER INSERT OR UPDATE OR DELETE ON caratloop.einvoice_documents FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- ─── einvoice_log: the journal entry a call concerns, and the lookup action ──
ALTER TABLE caratloop.einvoice_log
    ADD COLUMN IF NOT EXISTS journal_entry_id BIGINT REFERENCES caratloop.journal_entries(id);
CREATE INDEX IF NOT EXISTS ix_einvoice_log_journal_entry
    ON caratloop.einvoice_log(journal_entry_id, created_at);

ALTER TABLE caratloop.einvoice_log DROP CONSTRAINT IF EXISTS chk_einvoice_log_action;
ALTER TABLE caratloop.einvoice_log
    ADD CONSTRAINT chk_einvoice_log_action CHECK (((action)::text = ANY ((ARRAY[
        'Generate_IRN'::character varying,
        'Cancel_IRN'::character varying,
        'Get_IRN_By_Doc'::character varying,
        'Generate_EWB'::character varying,
        'Cancel_EWB'::character varying
    ])::text[])));
