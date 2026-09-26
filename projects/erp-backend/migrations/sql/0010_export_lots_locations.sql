-- Export invoices and multi-currency, loose gemstone lots, stock transfers.
--
-- ─── Export invoices ─────────────────────────────────────────────────────────
-- sales_invoices has carried invoice_type (Tax_Invoice | Bill_of_Supply |
-- Export_Invoice | Credit_Note_Invoice), currency and exchange_rate since the
-- baseline, and nothing wrote any of them: every invoice was a domestic tax
-- invoice in rupees. A Jaipur exporter needs the shipping bill, the port and
-- the LUT on the document (GSTR-1 Table 6A wants the first two), and needs the
-- foreign-currency figure the buyer agreed to next to the rupee figure the
-- books carry. The two export kinds are kept apart because they are taxed
-- differently: under a Letter of Undertaking no IGST is charged; without one
-- IGST is charged and refunded later.
--
-- ─── Loose gemstone lots ─────────────────────────────────────────────────────
-- stock_batches existed with a purchase-centric shape (batch_no, purity,
-- certificate) and was never written. A gemstone dealer's unit of stock is
-- the lot or parcel: so many carats of a sieve size, shape, colour and
-- clarity, bought at a price per carat, split into smaller parcels for
-- setting or sale, merged back, and losing a little weight at every cutting.
-- The lot gets those attributes, a per-company lot number, a parent for
-- splits and a target for merges, a status, and a cost per carat that is
-- carried through every split. The carats themselves move through
-- stock_ledger_entries, which gains a batch_id so a lot's balance is the sum
-- of its own entries and the material's balance is unchanged by re-tagging.
--
-- ─── Stock ledger sequence per company ───────────────────────────────────────
-- sequence_no was computed as MAX over the whole table; the index below makes
-- the per-company MAX the application now takes cheap.

-- ─── sales_invoices: export particulars and the foreign-currency totals ──────
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS export_type VARCHAR(20);
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS shipping_bill_no VARCHAR(20);
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS shipping_bill_date DATE;
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS port_code VARCHAR(10);
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS buyer_country VARCHAR(60);
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS lut_no VARCHAR(30);
-- Taxable value and grand total in the invoice currency. NULL on a rupee
-- invoice; the rupee columns are always the books.
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS fc_taxable_value NUMERIC(18,2);
ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS fc_grand_total NUMERIC(18,2);
ALTER TABLE caratloop.sales_invoices
    DROP CONSTRAINT IF EXISTS chk_invoice_export_type;
ALTER TABLE caratloop.sales_invoices
    ADD CONSTRAINT chk_invoice_export_type CHECK (export_type IS NULL OR ((export_type)::text = ANY ((ARRAY[
        'LUT_without_tax'::character varying,
        'With_IGST'::character varying
    ])::text[])));
-- An export invoice names its kind; a domestic one does not.
ALTER TABLE caratloop.sales_invoices
    DROP CONSTRAINT IF EXISTS chk_invoice_export_type_matches_kind;
ALTER TABLE caratloop.sales_invoices
    ADD CONSTRAINT chk_invoice_export_type_matches_kind
        CHECK ((invoice_type = 'Export_Invoice') = (export_type IS NOT NULL));
ALTER TABLE caratloop.sales_invoices
    DROP CONSTRAINT IF EXISTS chk_invoice_exchange_rate_positive;
ALTER TABLE caratloop.sales_invoices
    ADD CONSTRAINT chk_invoice_exchange_rate_positive
        CHECK (exchange_rate IS NULL OR exchange_rate > 0);

-- ─── sales_invoice_lines: the lot a gemstone line was taken from ─────────────
ALTER TABLE caratloop.sales_invoice_lines
    ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES caratloop.stock_batches(id);
CREATE INDEX IF NOT EXISTS ix_sales_invoice_lines_lot
    ON caratloop.sales_invoice_lines(lot_id);

-- ─── stock_batches: a gemstone lot ───────────────────────────────────────────
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS lot_no VARCHAR(30);
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS carat_weight NUMERIC(12,3) NOT NULL DEFAULT 0;
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS piece_count INTEGER;
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS sieve_size VARCHAR(20);
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS shape VARCHAR(30);
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS colour VARCHAR(30);
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS clarity VARCHAR(20);
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS origin VARCHAR(60);
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS treatment VARCHAR(60);
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS cost_per_carat NUMERIC(14,2);
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS parent_lot_id UUID REFERENCES caratloop.stock_batches(id);
-- Set on every source lot of a merge; parent_lot_id is the other direction
-- (the lot this one was split from) and the two must not share a column.
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS merged_into_lot_id UUID REFERENCES caratloop.stock_batches(id);
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'Open';
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES caratloop.stock_locations(id);
-- What the lot was opened from: a purchase invoice, or nothing (opening stock).
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS source_document_type VARCHAR(30);
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS source_document_id UUID;
ALTER TABLE caratloop.stock_batches
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE caratloop.stock_batches
    DROP CONSTRAINT IF EXISTS chk_lot_status;
ALTER TABLE caratloop.stock_batches
    ADD CONSTRAINT chk_lot_status CHECK (((status)::text = ANY ((ARRAY[
        'Open'::character varying,
        'Split'::character varying,
        'Merged'::character varying,
        'Sold'::character varying,
        'Closed'::character varying
    ])::text[])));
ALTER TABLE caratloop.stock_batches
    DROP CONSTRAINT IF EXISTS chk_lot_carat_weight_non_negative;
ALTER TABLE caratloop.stock_batches
    ADD CONSTRAINT chk_lot_carat_weight_non_negative CHECK (carat_weight >= 0);
ALTER TABLE caratloop.stock_batches
    DROP CONSTRAINT IF EXISTS chk_lot_piece_count_positive;
ALTER TABLE caratloop.stock_batches
    ADD CONSTRAINT chk_lot_piece_count_positive CHECK (piece_count IS NULL OR piece_count > 0);
-- Lot numbers are unique per company. Rows predating this migration have no
-- lot_no, hence the partial index rather than a constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_batch_lot_no
    ON caratloop.stock_batches(company_id, lot_no) WHERE lot_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_stock_batches_material_status
    ON caratloop.stock_batches(company_id, material_id, status);
CREATE INDEX IF NOT EXISTS ix_stock_batches_parent
    ON caratloop.stock_batches(parent_lot_id);

-- ─── stock_ledger_entries: which lot an entry belongs to ─────────────────────
ALTER TABLE caratloop.stock_ledger_entries
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES caratloop.stock_batches(id);
CREATE INDEX IF NOT EXISTS ix_sle_batch
    ON caratloop.stock_ledger_entries(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_sle_company_sequence
    ON caratloop.stock_ledger_entries(company_id, sequence_no);
CREATE INDEX IF NOT EXISTS ix_sle_company_location_material
    ON caratloop.stock_ledger_entries(company_id, location_id, material_id);
