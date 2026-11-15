-- Quotes, sales orders and purchase orders.
--
-- The books started at the invoice: a price given to a customer, an order
-- taken, an order placed with a supplier lived on paper or in WhatsApp. These
-- are documents of intent: they post nothing to the ledger and move no stock.
-- A quote becomes a sales order or an invoice, a sales order becomes an
-- invoice, a purchase order becomes a bill; the document records what it
-- turned into so the chain can be followed.
--
-- One table for the three kinds: they share every column and differ only in
-- the series they are numbered in and which party type they name.
CREATE TABLE IF NOT EXISTS caratloop.order_documents (
    id               UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    company_id       UUID NOT NULL REFERENCES caratloop.companies(id),
    doc_type         VARCHAR(20) NOT NULL,
    doc_no           VARCHAR(30) NOT NULL,
    doc_date         DATE NOT NULL,
    valid_until      DATE,
    party_id         UUID NOT NULL REFERENCES caratloop.parties(id),
    reference_no     VARCHAR(50),
    notes            TEXT,
    terms            TEXT,
    subtotal         NUMERIC(18,2) NOT NULL DEFAULT 0,
    discount_total   NUMERIC(18,2) NOT NULL DEFAULT 0,
    gst_total        NUMERIC(18,2) NOT NULL DEFAULT 0,
    grand_total      NUMERIC(18,2) NOT NULL DEFAULT 0,
    status           VARCHAR(20) NOT NULL DEFAULT 'Open',
    converted_to     VARCHAR(60),
    source_doc_id    UUID REFERENCES caratloop.order_documents(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by       UUID REFERENCES caratloop.users(id),
    CONSTRAINT uq_order_doc_no UNIQUE (company_id, doc_type, doc_no),
    CONSTRAINT chk_order_doc_type CHECK (((doc_type)::text = ANY ((ARRAY[
        'Quote'::character varying,
        'SalesOrder'::character varying,
        'PurchaseOrder'::character varying
    ])::text[]))),
    CONSTRAINT chk_order_doc_status CHECK (((status)::text = ANY ((ARRAY[
        'Open'::character varying,
        'Accepted'::character varying,
        'Declined'::character varying,
        'Converted'::character varying,
        'Cancelled'::character varying
    ])::text[])))
);
CREATE INDEX IF NOT EXISTS ix_order_documents_company_type_date
    ON caratloop.order_documents(company_id, doc_type, doc_date);
CREATE INDEX IF NOT EXISTS ix_order_documents_party
    ON caratloop.order_documents(party_id);

CREATE TABLE IF NOT EXISTS caratloop.order_document_lines (
    id               UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    document_id      UUID NOT NULL REFERENCES caratloop.order_documents(id) ON DELETE CASCADE,
    sequence_no      INTEGER NOT NULL,
    material_id      UUID REFERENCES caratloop.materials(id),
    description      VARCHAR(500),
    hsn_sac_code     VARCHAR(8),
    quantity         NUMERIC(12,4) NOT NULL DEFAULT 1,
    net_weight       NUMERIC(12,4),
    material_value   NUMERIC(18,2) NOT NULL DEFAULT 0,
    making_charges   NUMERIC(18,2) NOT NULL DEFAULT 0,
    discount_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
    material_gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    making_gst_rate  NUMERIC(5,2) NOT NULL DEFAULT 0,
    taxable          NUMERIC(18,2) NOT NULL DEFAULT 0,
    gst_amount       NUMERIC(18,2) NOT NULL DEFAULT 0,
    line_total       NUMERIC(18,2) NOT NULL DEFAULT 0,
    CONSTRAINT chk_order_line_discount CHECK (discount_pct >= 0 AND discount_pct <= 100)
);
CREATE INDEX IF NOT EXISTS ix_order_document_lines_doc
    ON caratloop.order_document_lines(document_id);

DROP TRIGGER IF EXISTS trg_audit_order_documents ON caratloop.order_documents;
CREATE TRIGGER trg_audit_order_documents AFTER INSERT OR UPDATE OR DELETE ON caratloop.order_documents FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();
